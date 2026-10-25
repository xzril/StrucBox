"""Train the small glyph classifier used to read labels in beam drawings offline (src/input/glyphs.ts).

Renders each class in many printed and handwriting fonts with distortions (rotation, shear, stroke
weight, blur, pixelation), trains a 2-layer MLP in numpy, and writes int8 weights to
src/input/glyph-model.json. Usage: python3 scripts/train_glyphs.py <font files...>
"""
import base64, json, random, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

CLASSES = list('0123456789kKNnmMftlbipsw/ABCDEF')
S = 20  # glyph image side
random.seed(1)
np.random.seed(1)


def components_bbox(a):
    ys, xs = np.nonzero(a)
    return (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1) if len(xs) else None


def render(font_path, ch, aug):
    size = 64
    font = ImageFont.truetype(font_path, size)
    img = Image.new('L', (size * 3, size * 3), 0)
    d = ImageDraw.Draw(img)
    d.text((size, size // 2), ch, fill=255, font=font)
    ref = Image.new('L', (size * 3, size * 3), 0)
    ImageDraw.Draw(ref).text((size, size // 2), '0', fill=255, font=font)
    if aug:
        ang, sh = random.uniform(-10, 10), random.uniform(-0.25, 0.25)
        tf = (1, sh, -sh * size * 1.5, 0, 1, 0)
        img, ref = (i.transform(i.size, Image.AFFINE, tf).rotate(ang, resample=Image.BILINEAR) for i in (img, ref))
        r = random.random()
        if r < 0.25:
            img = img.filter(ImageFilter.MaxFilter(random.choice([3, 5])))
        elif r < 0.4:
            img = img.filter(ImageFilter.MinFilter(3))
        img = img.filter(ImageFilter.GaussianBlur(random.uniform(0, 1.5)))
    a = np.asarray(img) > (random.uniform(70, 170) if aug else 128)
    b = components_bbox(a)
    rb = components_bbox(np.asarray(ref) > 128)
    if b is None or rb is None:
        return None
    x0, y0, x1, y1 = b
    crop = Image.fromarray((a[y0:y1, x0:x1] * 255).astype(np.uint8))
    if aug and random.random() < 0.5:  # pixelation: shrink to a few pixels tall and back
        h = random.randint(7, 18)
        w = max(1, round(crop.width * h / crop.height))
        crop = crop.resize((w, h), Image.BILINEAR)
    return features(np.asarray(crop) > 100 if aug else np.asarray(crop) > 128, (y1 - y0) / (rb[3] - rb[1]))


def features(a, rel_h):
    """Same as glyphFeatures() in src/input/glyphs.ts: S×S fit (aspect kept), then aspect and relative height."""
    h, w = a.shape
    k = (S - 2) / max(h, w)
    nw, nh = max(1, round(w * k)), max(1, round(h * k))
    im = Image.fromarray((a * 255).astype(np.uint8)).resize((nw, nh), Image.BILINEAR)
    out = np.zeros((S, S), np.float32)
    ox, oy = (S - nw) // 2, (S - nh) // 2
    out[oy:oy + nh, ox:ox + nw] = np.asarray(im, np.float32) / 255
    return np.concatenate([out.ravel(), [min(w / h, 3) / 3, min(rel_h, 1.5) / 1.5]]).astype(np.float32)


def main(fonts):
    X, Y = [], []
    for fp in fonts:
        for ci, ch in enumerate(CLASSES):
            for k in range(45):
                try:
                    f = render(fp, ch, aug=k > 0)
                except OSError:
                    break
                if f is not None:
                    X.append(f)
                    Y.append(ci)
        print(fp, len(X), flush=True)
    X, Y = np.array(X), np.array(Y)
    idx = np.random.permutation(len(X))
    X, Y = X[idx], Y[idx]
    n_val = len(X) // 10
    Xv, Yv, Xt, Yt = X[:n_val], Y[:n_val], X[n_val:], Y[n_val:]
    sizes = [X.shape[1], 256, len(CLASSES)]
    Ws = [np.random.randn(a, b).astype(np.float32) * np.sqrt(2 / a) for a, b in zip(sizes, sizes[1:])]
    bs = [np.zeros(b, np.float32) for b in sizes[1:]]
    m = [np.zeros_like(p) for p in Ws + bs]
    v = [np.zeros_like(p) for p in Ws + bs]
    lr, t = 1e-3, 0

    def forward(x):
        h = np.maximum(0, x @ Ws[0] + bs[0])
        return h, h @ Ws[1] + bs[1]

    for epoch in range(25):
        p = np.random.permutation(len(Xt))
        for i in range(0, len(p), 256):
            xb, yb = Xt[p[i:i + 256]], Yt[p[i:i + 256]]
            h, z = forward(xb)
            z -= z.max(1, keepdims=True)
            pr = np.exp(z)
            pr /= pr.sum(1, keepdims=True)
            pr[np.arange(len(yb)), yb] -= 1
            g2 = pr / len(yb)
            gW1, gb1 = h.T @ g2, g2.sum(0)
            gh = (g2 @ Ws[1].T) * (h > 0)
            gW0, gb0 = xb.T @ gh, gh.sum(0)
            t += 1
            for j, (param, g) in enumerate(zip(Ws + bs, [gW0, gW1, gb0, gb1])):
                m[j] = 0.9 * m[j] + 0.1 * g
                v[j] = 0.999 * v[j] + 0.001 * g * g
                param -= lr * (m[j] / (1 - 0.9 ** t)) / (np.sqrt(v[j] / (1 - 0.999 ** t)) + 1e-8)
        if epoch == 15:
            lr /= 3
        acc = (forward(Xv)[1].argmax(1) == Yv).mean()
        print('epoch', epoch, 'val acc', round(float(acc), 4), flush=True)

    def q(a):
        s = float(np.abs(a).max()) / 127
        return {'scale': s, 'shape': list(a.shape), 'data': base64.b64encode(np.round(a / s).astype(np.int8).tobytes()).decode()}

    json.dump({'classes': ''.join(CLASSES), 'side': S, 'W': [q(w) for w in Ws], 'b': [bb.tolist() for bb in bs]},
              open('src/input/glyph-model.json', 'w'))


if __name__ == '__main__':
    main(sys.argv[1:])
