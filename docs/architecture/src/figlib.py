"""Paper-style (black & white, serif) SVG figure toolkit — same look as the DiaVeritas figures."""
import os

FONT = "'Times New Roman', Times, serif"
SW = 1.5
GREY = "#777"


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


class Fig:
    def __init__(self, W, H, dy=0):
        self.W, self.H, self.dy = W, H, dy
        self.p = []

    def add(self, s):
        self.p.append(s)

    # ---------------------------------------------------------------- text
    def text(self, x, y, s, size=17, anchor="middle", italic=False, weight="normal", fill="#000", rotate=None):
        st = ' font-style="italic"' if italic else ""
        tr = f' transform="rotate({rotate} {x} {y})"' if rotate else ""
        self.add(f'<text x="{x}" y="{y}" font-size="{size}" text-anchor="{anchor}" font-weight="{weight}" '
                 f'fill="{fill}"{st}{tr}>{esc(s)}</text>')

    def mtext(self, x, cy, lines, size=17, lh=None, **kw):
        if isinstance(lines, str):
            lines = lines.split("\n")
        lh = lh or size * 1.2
        n = len(lines)
        for i, ln in enumerate(lines):
            self.text(x, cy + (i - (n - 1) / 2) * lh + size * 0.35, ln, size, **kw)

    def label(self, x, y, s, anchor="middle", size=13.5, **kw):
        self.text(x, y, s, size, anchor=anchor, italic=True, **kw)

    # ---------------------------------------------------------------- shapes
    def rect(self, x, y, w, h, rx=7, dash=False, sw=SW, stroke="#000", fill="#fff"):
        da = ' stroke-dasharray="6 4"' if dash else ""
        self.add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}" stroke="{stroke}" '
                 f'stroke-width="{sw}"{da}/>')

    def box(self, cx, cy, w, h, label, sub=None, size=17, subsize=13.5, dash=False, sw=SW):
        """Rounded box; label/sub may be str (\\n for breaks) or list."""
        self.rect(cx - w / 2, cy - h / 2, w, h, dash=dash, sw=sw)
        main = label.split("\n") if isinstance(label, str) else list(label)
        subs = [] if sub is None else (sub.split("\n") if isinstance(sub, str) else list(sub))
        lm, ls = size * 1.2, subsize * 1.3
        total = len(main) * lm + len(subs) * ls
        y = cy - total / 2
        for ln in main:
            self.text(cx, y + lm * 0.78, ln, size)
            y += lm
        for ln in subs:
            self.text(cx, y + ls * 0.78, ln, subsize, italic=True)
            y += ls

    def cyl(self, cx, cy, w, h, lines, size=15.5, sub=None, subsize=13):
        rx, ry = w / 2, 11
        top = cy - h / 2
        self.add(f'<path d="M{cx-rx},{top+ry} L{cx-rx},{top+h-ry} A{rx},{ry} 0 0 0 {cx+rx},{top+h-ry} '
                 f'L{cx+rx},{top+ry}" fill="#fff" stroke="#000" stroke-width="{SW}"/>')
        self.add(f'<ellipse cx="{cx}" cy="{top+ry}" rx="{rx}" ry="{ry}" fill="#fff" stroke="#000" stroke-width="{SW}"/>')
        main = lines.split("\n") if isinstance(lines, str) else list(lines)
        subs = [] if sub is None else (sub.split("\n") if isinstance(sub, str) else list(sub))
        lm, ls = size * 1.2, subsize * 1.3
        total = len(main) * lm + len(subs) * ls
        y = cy + ry / 2 - total / 2
        for ln in main:
            self.text(cx, y + lm * 0.78, ln, size)
            y += lm
        for ln in subs:
            self.text(cx, y + ls * 0.78, ln, subsize, italic=True)
            y += ls

    def diamond(self, cx, cy, w, h, label, size=16.5):
        hw, hh = w / 2, h / 2
        self.add(f'<path d="M{cx},{cy-hh} L{cx+hw},{cy} L{cx},{cy+hh} L{cx-hw},{cy} Z" fill="#fff" stroke="#000" '
                 f'stroke-width="{SW}"/>')
        self.mtext(cx, cy, label, size)

    def cont(self, x1, y1, x2, y2, label, size=15, dash=False, sw=1.8, rx=18):
        da = ' stroke-dasharray="8 5"' if dash else ""
        self.add(f'<rect x="{x1}" y="{y1}" width="{x2-x1}" height="{y2-y1}" rx="{rx}" fill="none" stroke="#000" '
                 f'stroke-width="{sw}"{da}/>')
        if label:
            self.text(x1 + 14, y1 + 22, label, size, anchor="start", italic=True)

    def zone(self, x1, y1, x2, y2, label, size=13.5, stroke="#000", dash=True, sw=1.1, rx=10):
        da = ' stroke-dasharray="5 4"' if dash else ""
        self.add(f'<rect x="{x1}" y="{y1}" width="{x2-x1}" height="{y2-y1}" rx="{rx}" fill="none" stroke="{stroke}" '
                 f'stroke-width="{sw}"{da}/>')
        if label:
            self.text(x1 + 10, y1 + 17, label, size, anchor="start", italic=True)

    def line(self, pts, arrow=True, dash=False, color="#000", sw=SW, both=False):
        d = "M" + " L".join(f"{x},{y}" for x, y in pts)
        m = ' marker-end="url(#ah)"' if arrow else ""
        if both:
            m += ' marker-start="url(#ahs)"'
        da = ' stroke-dasharray="6 5"' if dash else ""
        self.add(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{sw}" stroke-linejoin="round"{m}{da}/>')

    def note(self, x0, y, xt, lines, size=15.5):
        self.line([(x0 + 8, y), (xt - 12, y)], arrow=False, dash=True, color=GREY, sw=1)
        self.add(f'<circle cx="{x0 + 8}" cy="{y}" r="2.2" fill="{GREY}"/>')
        self.mtext(xt, y, lines, size, lh=20, anchor="start", italic=True, fill="#1a1a1a")

    # ---------------------------------------------------------------- output
    def save(self, out_dir, name, caption=None, cap_y=None):
        if caption:
            self.text(self.W / 2, cap_y if cap_y is not None else self.H - 30, caption, 16.5)
        body = "".join(self.p)
        if self.dy:
            body = f'<g transform="translate(0,{self.dy})">{body}</g>'
        svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.W}" height="{self.H}" '
               f'viewBox="0 0 {self.W} {self.H}" font-family="{FONT}"><defs>'
               f'<marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" '
               f'markerUnits="userSpaceOnUse" orient="auto"><path d="M1,1 L9,5 L1,9" fill="none" stroke="#000" '
               f'stroke-width="1.6"/></marker>'
               f'<marker id="ahs" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" '
               f'markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M1,1 L9,5 L1,9" fill="none" '
               f'stroke="#000" stroke-width="1.6"/></marker></defs>'
               f'<rect width="{self.W}" height="{self.H}" fill="#fff"/>{body}</svg>')
        base = os.path.join(out_dir, name)
        open(base + ".svg", "w", encoding="utf-8").write(svg)
        open(base + ".html", "w", encoding="utf-8").write(
            f'<!doctype html><html><head><meta charset="utf-8"><title>{name}</title><style>html,body{{margin:0;'
            f'background:#fff}}svg{{display:block}}</style></head><body>{svg}</body></html>')
        print(name, self.W, int(self.H))


# ============================================================================
# Vertical, bottom-to-top stage builder (as in the DiaVeritas stage figures)
# ============================================================================
def build(out_dir, name, title, nodes, input_label, output_label, caption, extras=None,
          W=1500, XC=560, NOTE_X=820, GAP=30):
    """nodes bottom-up. types: box(w, label, sub, dash), pair/trio(labels, w, h, dash), cyl2(labels, w),
    diamond(label). Optional keys: note, note_from, gap_above, in_label."""
    pos = []
    y = 0
    for n in nodes:
        t = n["type"]
        if t == "box":
            w = n.get("w", 300)
            h = n.get("h", 58 if n.get("sub") else 44)
            xs = [XC]
        elif t in ("pair", "trio", "cyl2"):
            k = 2 if t != "trio" else 3
            w = n.get("w", {"pair": 145, "trio": 132, "cyl2": 140}[t])
            h = n.get("h", {"pair": 44, "trio": 52, "cyl2": 74}[t])
            g = n.get("g", 12)
            span = k * w + (k - 1) * g
            xs = [XC - span / 2 + w / 2 + i * (w + g) for i in range(k)]
        elif t == "diamond":
            w, h = n.get("w", 130), n.get("h", 72)
            xs = [XC]
        top = y - h
        pos.append(dict(top=top, bottom=y, cy=(top + y) / 2, xs=xs, w=w, h=h,
                        left=xs[0] - w / 2, right=xs[-1] + w / 2))
        y = top - n.get("gap_above", GAP)

    maxw = max(p["right"] - p["left"] for p in pos)
    c_left, c_right = XC - maxw / 2 - 32, XC + maxw / 2 + 32
    c_top, c_bottom = pos[-1]["top"] - 44, 20
    out_lines = output_label.split("\n")
    out_y = c_top - 50
    top_bound = out_y - 30 - 20 * len(out_lines)
    in_lines = input_label.split("\n")
    in_y = c_bottom + 50 + 10 * len(in_lines)
    cap_y = in_y + 40 + 10 * len(in_lines)
    H = cap_y + 34 - top_bound
    f = Fig(W, H, dy=-top_bound)

    f.cont(c_left, c_top, c_right, c_bottom, title)
    for n, p in zip(nodes, pos):
        t = n["type"]
        if t == "box":
            f.box(XC, p["cy"], p["w"], p["h"], n["label"], n.get("sub"), dash=n.get("dash", False))
        elif t in ("pair", "trio"):
            size = n.get("size", 16 if t == "pair" else 14.5)
            subs = n.get("subs", [None] * len(p["xs"]))
            for i, (x, lab) in enumerate(zip(p["xs"], n["labels"])):
                f.box(x, p["cy"], p["w"], p["h"], lab, subs[i], size=size, subsize=12.5,
                      dash=(i in n.get("dash_idx", [])))
        elif t == "cyl2":
            for x, lab in zip(p["xs"], n["labels"]):
                f.cyl(x, p["cy"], p["w"], p["h"], lab, size=n.get("size", 15.5))
        elif t == "diamond":
            f.diamond(XC, p["cy"], p["w"], p["h"], n["label"])

    for a, b, nb in zip(pos, pos[1:], nodes[1:]):
        src, dst = a["xs"], b["xs"]
        if len(src) == 1 and len(dst) == 1:
            f.line([(XC, a["top"]), (XC, b["bottom"] + 1)])
        elif len(src) == len(dst):
            for x1, x2 in zip(src, dst):
                f.line([(x1, a["top"]), (x2, b["bottom"] + 1)])
        else:
            mid = (a["top"] + b["bottom"]) / 2
            for x in src:
                f.line([(x, a["top"]), (x, mid)], arrow=False)
            xs_all = src + dst
            f.line([(min(xs_all), mid), (max(xs_all), mid)], arrow=False)
            for x in dst:
                f.line([(x, mid), (x, b["bottom"] + 1)])
        if nb.get("in_label"):
            f.label(XC + 10, a["top"] - 6, nb["in_label"], anchor="start")

    f.mtext(XC, in_y, in_lines, 17)
    f.line([(XC, in_y - 22 - 10 * (len(in_lines) - 1)), (XC, 1)])
    f.line([(XC, pos[-1]["top"]), (XC, out_y + 12)])
    f.mtext(XC, out_y - 10 * len(out_lines), out_lines, 17)

    for n, p in zip(nodes, pos):
        if n.get("note"):
            f.note(n.get("note_from", p["right"]), p["cy"], NOTE_X, n["note"])

    if extras:
        extras(f, pos)
    f.save(out_dir, name, caption, cap_y)
    return f
