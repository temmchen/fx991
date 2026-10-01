// numerics.js – Nullstellensuche (Brent), Integration (Gauß-Kronrod), Polynomwurzeln (Aberth),
// HP-artiger Gleichungslöser und die automatische Kurvenanalyse (Nullstellen, Extrema, Wendepunkte,
// Schnittpunkte). Portierung von Numerics.swift; dazu die Gammafunktion (Ersatz für tgamma).
import { Complex } from './complex.js';

// MARK: Hilfen (Swift-Semantik)

/// Swift.min: bei Gleichheit oder NaN im zweiten Argument gewinnt das erste (anders als Math.min)
function smin(x, y) { return y < x ? y : x; }
/// Swift.max: bei Gleichheit gewinnt das zweite, bei NaN im zweiten das erste (anders als Math.max)
function smax(x, y) { return y >= x ? y : x; }
/// Double.isFinite
function fin(v) { return Number.isFinite(v); }
/// Vergleichsfunktion für sort() aus einem „kleiner als“-Prädikat wie in Swift (stabil bei Gleichheit)
function byLess(less) { return (a, b) => (less(a, b) ? -1 : (less(b, a) ? 1 : 0)); }
/// 10^k exakt gerundet (wie Foundation.pow(10, k))
function pow10(k) { return Number('1e' + k); }

// MARK: Gammafunktion (Ersatz für tgamma)
//
// Lanczos-Näherung mit g = 6,0246800407767295… und 13 Gliedern als rationale Funktion
// (Satz „lanczos13m53“), dazu die Korrektur des Rundungsfehlers in x + g − ½. Negative, nicht
// ganze x über die Spiegelung Γ(−a) = −π / (sin(πa) · a · Γ(a)); sin(πa) wird nach exakter
// Reduktion modulo 2 berechnet, damit auch nahe den Polstellen der relative Fehler klein bleibt.
// Ganze x ≤ 171 exakt aus der Fakultätstabelle (BigInt, korrekt gerundet).
// Sonderfälle wie tgamma: Γ(±0) = ±∞, Γ(−n) = NaN, Γ(+∞) = +∞, Γ(−∞) = NaN, Überlauf → +∞.

const LANCZOS_G = 6.024680040776729583740234375;
const LANCZOS_G_MINUS_HALF = 5.524680040776729583740234375;
const LANCZOS_NUM = [
    23531376880.410759688572007674451636754734846804940,
    42919803642.649098768957899047001988850926355848959,
    35711959237.355668049440185451547166705960488635843,
    17921034426.037209699919755754458931112671403265390,
    6039542586.3520280050642916443072979210699388420708,
    1439720407.3117216736632230727949123939715485786772,
    248874557.86205415651146038641322942321632125127801,
    31426415.585400194380614231628318205362874684987640,
    2876370.6289353724412254090516208496135991145378768,
    186056.26539522349504029498971604569928220784236328,
    8071.6720023658162106380029022722506138218516325024,
    210.82427775157934587250973392071336271166969580291,
    2.5066282746310002701649081771338373386264310793408,
];
/// Koeffizienten von x(x+1)(x+2)…(x+11), aufsteigend nach Potenzen
const LANCZOS_DEN = [0, 39916800, 120543840, 150917976, 105258076, 45995730,
    13339535, 2637558, 357423, 32670, 1925, 66, 1];

/// FAKULTAET[n] = n! für n = 0 … 170, exakt mit BigInt gerechnet und korrekt gerundet
const FAKULTAET = (() => {
    const t = [1];
    let f = 1n;
    for (let n = 1; n <= 170; n++) {
        f *= BigInt(n);
        t.push(Number(f));
    }
    return t;
})();

/// Rationale Lanczos-Summe; für große x als Funktion von 1/x (kein Überlauf, genauer)
function lanczosSum(x) {
    let num = 0, den = 0;
    if (x < 5) {
        for (let i = LANCZOS_NUM.length - 1; i >= 0; i--) {
            num = num * x + LANCZOS_NUM[i];
            den = den * x + LANCZOS_DEN[i];
        }
    } else {
        for (let i = 0; i < LANCZOS_NUM.length; i++) {
            num = num / x + LANCZOS_NUM[i];
            den = den / x + LANCZOS_DEN[i];
        }
    }
    return num / den;
}

/// sin(π·x) mit exakter Reduktion (keine Auslöschung bei großen x oder nahe ganzen Zahlen)
function sinPi(x) {
    const y = Math.abs(x) % 2;          // exakt
    const n = Math.round(2 * y);        // 0 … 4
    let r;
    switch (n) {
    case 0: r = Math.sin(Math.PI * y); break;
    case 1: r = Math.cos(Math.PI * (y - 0.5)); break;
    case 2: r = Math.sin(Math.PI * (1 - y)); break;     // nicht −sin(π(y−1)): sonst −0 bei y = 1
    case 3: r = -Math.cos(Math.PI * (y - 1.5)); break;
    default: r = Math.sin(Math.PI * (y - 2)); break;
    }
    return (x < 0 || Object.is(x, -0) ? -1 : 1) * r;
}

/// Gammafunktion Γ(x) für reelle x (relativer Fehler um 1e-15, Anforderung ≤ 1e-13)
export function gamma(x) {
    if (typeof x !== 'number') x = Number(x);
    // Sonderfälle
    if (!fin(x)) {
        if (Number.isNaN(x) || x > 0) return x;     // Γ(NaN) = NaN, Γ(+∞) = +∞
        return NaN;                                 // Γ(−∞) = NaN
    }
    if (x === 0) return Object.is(x, -0) ? -Infinity : Infinity;
    // ganze Zahlen: Polstellen bzw. exakte Fakultät
    if (x === Math.floor(x)) {
        if (x < 0) return NaN;
        if (x <= 171) return FAKULTAET[x - 1];
        return Infinity;
    }
    const absx = Math.abs(x);
    // winzige Argumente: Γ(x) ≈ 1/x
    if (absx < 1e-20) return 1 / x;
    // große Argumente: Überlauf bzw. Unterlauf auf ±0 (Vorzeichen wie Γ)
    if (absx > 200) {
        if (x < 0) return 0 / sinPi(x);
        return Infinity;
    }
    const y = absx + LANCZOS_G_MINUS_HALF;
    // Rundungsfehler in y = absx + g − ½ bestimmen und später korrigieren
    let z;
    if (absx > LANCZOS_G_MINUS_HALF) {
        const q = y - absx;
        z = q - LANCZOS_G_MINUS_HALF;
    } else {
        const q = y - LANCZOS_G_MINUS_HALF;
        z = q - absx;
    }
    z = z * LANCZOS_G / y;
    let r;
    if (x < 0) {
        // Spiegelung
        r = -Math.PI / sinPi(absx) / absx * Math.exp(y) / lanczosSum(absx);
        r -= z * r;
        if (absx < 140) {
            r /= Math.pow(y, absx - 0.5);
        } else {
            const sqrtpow = Math.pow(y, absx / 2 - 0.25);
            r /= sqrtpow;
            r /= sqrtpow;
        }
    } else {
        r = lanczosSum(absx) / Math.exp(y);
        r += z * r;
        if (absx < 140) {
            r *= Math.pow(y, absx - 0.5);
        } else {
            // Potenz aufteilen, damit das Zwischenergebnis nicht vorzeitig überläuft
            const sqrtpow = Math.pow(y, absx / 2 - 0.25);
            r *= sqrtpow;
            r *= sqrtpow;
        }
    }
    return r;
}

// MARK: HP-artiger Löser – Status und Meldungen

export const SOLVE = { root: 'root', signReversal: 'signReversal', extremum: 'extremum', failed: 'failed' };

/// Meldungstext zum Löser-Status (wie SolveStatus.meldung in Swift)
export function solveMeldung(status) {
    switch (status) {
    case SOLVE.root: return 'Nullstelle';
    case SOLVE.signReversal: return 'Vorzeichenwechsel – Unstetigkeit?';
    case SOLVE.extremum: return 'Extremum – keine Nullstelle gefunden';
    case SOLVE.failed: return 'Keine Lösung gefunden';
    default: return '';
    }
}

// MARK: Integration (adaptiv, Gauß-Kronrod 7/15)

const XGK = [0.991455371120812639206854697526329, 0.949107912342758524526189684047851,
    0.864864423359769072789712788640926, 0.741531185599394439863864773280788,
    0.586087235467691130294144845693013, 0.405845151377397166906606412076961,
    0.207784955007898467600689403773245, 0.0];
const WGK = [0.022935322010529224963732008058970, 0.063092092629978553290700663189204,
    0.104790010322250183839876322541518, 0.140653259715525918745189590510238,
    0.169004726639267902826583426598550, 0.190350578064785409913256402421014,
    0.204432940075298892414161999234649, 0.209482141084727828012999174891714];
const WG = [0.129484966168869693270611432679082, 0.279705391489276667901467771423780,
    0.381830050505118944950369775488975, 0.417959183673469387755102040816327];

/// Ein Gauß-Kronrod-Schritt auf [a, b]: [Kronrod-Wert, Fehlerschätzung |K − G|]
function qk15(f, a, b) {
    const c = 0.5 * (a + b), h = 0.5 * (b - a);
    const fc = f(c);
    let resg = fc * WG[3], resk = fc * WGK[7];
    for (let j = 0; j < 3; j++) {
        const k = 2 * j + 1;
        const dx = h * XGK[k];
        const s = f(c - dx) + f(c + dx);
        resg += WG[j] * s;
        resk += WGK[k] * s;
    }
    for (let j = 0; j < 4; j++) {
        const k = 2 * j;
        const dx = h * XGK[k];
        resk += WGK[k] * (f(c - dx) + f(c + dx));
    }
    return [resk * h, Math.abs((resk - resg) * h)];
}

// MARK: Brent (zeroin) und Bisektion

/// Einfache Bisektion; bricht bei nicht endlichen Werten ab
function bisect(f, a0, b0, fa0) {
    let a = a0, b = b0, fa = fa0;
    for (let i = 0; i < 200; i++) {
        const m = 0.5 * (a + b);
        if (m === a || m === b) return m;
        const fm = f(m);
        if (!fin(fm)) return null;
        if (fm === 0) return m;
        if ((fm < 0) === (fa < 0)) { a = m; fa = fm; } else { b = m; }
    }
    return 0.5 * (a + b);
}

// MARK: Polynome – Aberth-Ehrlich

function aberth(c) {
    const n = c.length - 1;
    const monic = c.map((v) => v / c[0]);
    let r = Math.pow(Math.abs(monic[n]), 1 / n);
    if (!(r > 1e-12) || !fin(r)) r = 1;
    const z = [];
    for (let k = 0; k < n; k++) z.push(Complex.polar(r, 2 * Math.PI * k / n + 0.4));
    for (let it = 0; it < 800; it++) {
        let maxStep = 0;
        for (let k = 0; k < n; k++) {
            const [p, dp] = Numerics.polyEvalC(monic, z[k]);
            if (p.isZero()) continue;
            const ratio = p.div(dp);
            let s = new Complex(0, 0);
            for (let j = 0; j < n; j++) {
                if (j === k) continue;
                s = s.add(new Complex(1, 0).div(z[k].sub(z[j])));
            }
            const w = ratio.div(new Complex(1, 0).sub(ratio.mul(s)));
            if (!w.isFinite()) continue;
            z[k] = z[k].sub(w);
            maxStep = smax(maxStep, w.abs / smax(1, z[k].abs));
        }
        if (maxStep < 1e-16) break;
    }
    // Newton-Nachpolitur am Originalpolynom
    for (let k = 0; k < n; k++) {
        for (let it = 0; it < 3; it++) {
            const [p, dp] = Numerics.polyEvalC(c, z[k]);
            if (dp.isZero()) break;
            const step = p.div(dp);
            if (!step.isFinite() || step.abs > 1e-3 * smax(1, z[k].abs)) break;
            z[k] = z[k].sub(step);
        }
    }
    // Mehrfachwurzeln: Häufungen mitteln
    const used = new Array(n).fill(false);
    const out = [];
    for (let i = 0; i < n; i++) {
        if (used[i]) continue;
        const group = [i];
        used[i] = true;
        for (let j = i + 1; j < n; j++) {
            if (used[j]) continue;
            if (z[i].sub(z[j]).abs < 2e-5 * smax(1, z[i].abs)) {
                group.push(j);
                used[j] = true;
            }
        }
        let mean = new Complex(0, 0);
        for (const g of group) mean = mean.add(z[g]);
        mean = mean.div(group.length);
        if (group.length === 1) mean = z[i];
        for (let q = 0; q < group.length; q++) out.push(new Complex(mean.re, mean.im));
    }
    return out;
}

export const Numerics = {

    // MARK: Brent (zeroin)

    /// Nullstelle in [a, b] bei Vorzeichenwechsel; null ohne Vorzeichenwechsel oder bei nicht endlichen Randwerten
    brent(f, a0, b0, fa0 = null, fb0 = null, maxIter = 200) {
        let a = a0, b = b0;
        let fa = fa0 ?? f(a), fb = fb0 ?? f(b);
        if (!fin(fa) || !fin(fb)) return null;
        if (fa === 0) return a;
        if (fb === 0) return b;
        if ((fa < 0) === (fb < 0)) return null;
        let c = a, fc = fa;
        let d = b - a, e = d;
        for (let it = 0; it < maxIter; it++) {
            if ((fb < 0) === (fc < 0)) {
                c = a; fc = fa; d = b - a; e = d;
            }
            if (Math.abs(fc) < Math.abs(fb)) {
                a = b; b = c; c = a;
                fa = fb; fb = fc; fc = fa;
            }
            const tol1 = 2 * Number.EPSILON * Math.abs(b) + 1e-300;
            const xm = 0.5 * (c - b);
            if (Math.abs(xm) <= tol1 || fb === 0) return b;
            if (Math.abs(e) >= tol1 && Math.abs(fa) > Math.abs(fb)) {
                const s = fb / fa;
                let p, q;
                if (a === c) {
                    p = 2 * xm * s;
                    q = 1 - s;
                } else {
                    const qq = fa / fc, r = fb / fc;
                    p = s * (2 * xm * qq * (qq - r) - (b - a) * (r - 1));
                    q = (qq - 1) * (r - 1) * (s - 1);
                }
                if (p > 0) { q = -q; } else { p = -p; }
                if (2 * p < smin(3 * xm * q - Math.abs(tol1 * q), Math.abs(e * q))) {
                    e = d;
                    d = p / q;
                } else {
                    d = xm;
                    e = d;
                }
            } else {
                d = xm;
                e = d;
            }
            a = b;
            fa = fb;
            b += Math.abs(d) > tol1 ? d : (xm > 0 ? tol1 : -tol1);
            fb = f(b);
            if (!fin(fb)) {
                // Unstetigkeit in der Klammer: auf Bisektion zwischen den letzten endlichen Punkten zurückfallen
                return bisect(f, a, c, fa);
            }
        }
        return b;
    },

    /// Einfache Bisektion (von brent als Rückfall benutzt)
    bisect,

    /// Grenze zwischen Definitionsbereich (endlicher Wert) und Lücke (NaN)
    domainEdge(f, xf0, xn0) {
        let xf = xf0, xn = xn0;
        for (let i = 0; i < 80; i++) {
            const m = 0.5 * (xf + xn);
            if (m === xf || m === xn) break;
            if (fin(f(m))) { xf = m; } else { xn = m; }
        }
        return xf;
    },

    // MARK: Integration (adaptiv, Gauß-Kronrod 7/15)

    /// ∫ f von a bis b → { value, error }
    integrate(f, a, b, tol = 1e-11) {
        if (a === b) return { value: 0, error: 0 };
        if (a > b) {
            const r = Numerics.integrate(f, b, a, tol);
            return { value: -r.value, error: r.error };
        }
        const whole = qk15(f, a, b);
        if (!fin(whole[0])) return { value: NaN, error: Infinity };
        const absTol = smax(tol * Math.abs(whole[0]), 1e-14);
        let calls = 0;
        let totalErr = 0;
        const rec = (lo, hi, est, depth, tl) => {
            calls += 1;
            if (est[1] <= tl || depth >= 48 || calls > 40000) {
                totalErr += est[1];
                return est[0];
            }
            const m = 0.5 * (lo + hi);
            const l = qk15(f, lo, m), r = qk15(f, m, hi);
            if (!fin(l[0] + r[0])) { totalErr = Infinity; return NaN; }
            return rec(lo, m, l, depth + 1, tl / 2) + rec(m, hi, r, depth + 1, tl / 2);
        };
        const v = rec(a, b, whole, 0, absTol);
        return { value: v, error: totalErr };
    },

    // MARK: Polynome (Koeffizienten vom höchsten Grad abwärts)

    polyEval(c, x) {
        let r = 0;
        for (const a of c) r = r * x + a;
        return r;
    },

    /// Wert und Ableitung im Komplexen: [p(z), p′(z)]
    polyEvalC(c, z) {
        let p = new Complex(0, 0), dp = new Complex(0, 0);
        for (const a of c) {
            dp = dp.mul(z).add(p);
            p = p.mul(z).add(new Complex(a, 0));
        }
        return [p, dp];
    },

    quadraticRoots(a, b, c) {
        if (a === 0) return b === 0 ? [] : [new Complex(-c / b, 0)];
        const D = b * b - 4 * a * c;
        if (D >= 0) {
            const s = Math.sqrt(D);
            const q = -0.5 * (b + (b >= 0 ? s : -s));
            if (q === 0) return [new Complex(0, 0), new Complex(0, 0)];
            const x1 = q / a, x2 = c / q;
            return [new Complex(smin(x1, x2), 0), new Complex(smax(x1, x2), 0)];
        }
        const re = -b / (2 * a), im = Math.sqrt(-D) / (2 * Math.abs(a));
        return [new Complex(re, im), new Complex(re, -im)];
    },

    /// Alle komplexen Nullstellen (Aberth-Ehrlich), reelle zuerst (aufsteigend), dann konjugierte Paare
    polyRoots(coeffs) {
        const c = coeffs.slice();
        while (c.length > 1 && c[0] === 0) c.shift();
        const roots = [];
        while (c.length > 1 && c[c.length - 1] === 0) {
            c.pop();
            roots.push(new Complex(0, 0));
        }
        const n = c.length - 1;
        if (n >= 1) {
            if (n === 1) {
                roots.push(new Complex(-c[1] / c[0], 0));
            } else if (n === 2) {
                roots.push(...Numerics.quadraticRoots(c[0], c[1], c[2]));
            } else {
                roots.push(...aberth(c));
            }
        }
        return Numerics.sortRoots(roots);
    },

    /// Reelle Wurzeln säubern (winziger Imaginärteil → 0) und sortieren
    sortRoots(roots) {
        const cleaned = roots.map((z) => {
            if (Math.abs(z.im) <= 1e-9 * smax(1, Math.abs(z.re))) return new Complex(z.re, 0);
            return z;
        });
        const real = cleaned.filter((z) => z.im === 0).sort(byLess((p, q) => p.re < q.re));
        const cpx = cleaned.filter((z) => z.im > 0)
            .sort(byLess((p, q) => p.re < q.re || (p.re === q.re && p.im < q.im)));
        const out = real.slice();
        for (const z of cpx) {
            out.push(z);
            out.push(z.conj());
        }
        // Paare, die nicht sauber konjugiert gefunden wurden
        const rest = cleaned.filter((z) => z.im < 0);
        if (rest.length > cpx.length) {
            for (const z of rest.slice(cpx.length)) out.push(z);
        }
        return out;
    },

    // MARK: HP-artiger Löser für f(v) = 0

    /// → { x, fx, status } mit status aus SOLVE
    solve(g, guess, guess2 = null) {
        const x0 = fin(guess) ? guess : 1;
        const probes = [];
        const evaluate = (x) => {
            const v = g(x);
            probes.push({ x, f: v });
            return v;
        };
        /// echte Nullstelle, nicht nur ein flacher Unterlauf (e^(−x) für riesige x)
        const isolatedZero = (x) => {
            const h = smax(Math.abs(x) * 1e-7, 1e-300);
            return g(x - h) !== 0 || g(x + h) !== 0;
        };
        const result = (x, fx, status) => ({ x, fx, status });
        const f0 = evaluate(x0);
        if (f0 === 0 && isolatedZero(x0)) return result(x0, 0, SOLVE.root);

        /// Brent in der Klammer; Polstelle/Sprung → Vorzeichenwechsel
        const refine = (a, fa, b, fb) => {
            const lo = smin(a, b), hi = smax(a, b);
            const r = Numerics.brent(g, lo, hi, a < b ? fa : fb, a < b ? fb : fa);
            if (r === null) return result((lo + hi) / 2, NaN, SOLVE.signReversal);
            const fr = g(r);
            const ref = smax(Math.abs(fa), Math.abs(fb));
            if (fin(fr) && Math.abs(fr) <= 1e-8 * ref + 1e-300) return result(r, fr, SOLVE.root);
            return result(r, fr, SOLVE.signReversal);
        };

        // 1. Sekantenverfahren vom Startwert aus (schnell, wenn der Startwert gut ist)
        let xa = x0, fa = f0;
        let xb = guess2 ?? (x0 === 0 ? 1e-4 : x0 * (1 + 1e-4));
        let fb = evaluate(xb);
        if (fb === 0 && isolatedZero(xb)) return result(xb, 0, SOLVE.root);
        for (let it = 0; it < 60; it++) {
            if (fin(fa) && fin(fb) && (fa < 0) !== (fb < 0)) {
                const r = refine(xa, fa, xb, fb);
                if (r.status === SOLVE.root) return r;
            }
            if (!(fin(fa) && fin(fb) && fb !== fa)) break;
            let xn = xb - fb * (xb - xa) / (fb - fa);
            if (!fin(xn)) break;
            const maxStep = 100 * smax(1, Math.abs(xb));
            if (Math.abs(xn - xb) > maxStep) xn = xb + (xn > xb ? maxStep : -maxStep);
            if (xn === xb) break;
            const fn = evaluate(xn);
            if (fn === 0 && isolatedZero(xn)) return result(xn, 0, SOLVE.root);
            if (!fin(fn) || fn === 0) break;
            xa = xb; fa = fb;
            xb = xn; fb = fn;
            if (Math.abs(xb - xa) <= 1e-15 * smax(1, Math.abs(xb))) break;
        }

        // 2. Suche: um den Startwert herum und über alle Größenordnungen (µF, nF, kΩ …)
        let step = smax(Math.abs(x0) * 0.01, 0.01);
        for (let it = 0; it < 70; it++) {
            evaluate(x0 + step);
            evaluate(x0 - step);
            step *= 1.6;
            if (step > 1e30) break;
        }
        for (let k = -18; k <= 15; k++) {
            for (const m of [1, 2, 5]) {
                const v = m * pow10(k);
                evaluate(v);
                evaluate(-v);
            }
        }
        const nearFirst = probes.slice().sort(byLess((p, q) => Math.abs(p.x - x0) < Math.abs(q.x - x0)));
        const z = nearFirst.find((p) => p.f === 0 && isolatedZero(p.x));
        if (z) return result(z.x, 0, SOLVE.root);

        // 3. an Definitionsränder herantasten (z. B. √(L·C) nur für C > 0)
        const sortedProbes = () => {
            const seen = new Set();
            return probes.slice().sort(byLess((p, q) => p.x < q.x)).filter((p) => {
                if (seen.has(p.x)) return false;
                seen.add(p.x);
                return true;
            });
        };
        let sp = sortedProbes();
        for (let i = 0; i < sp.length - 1; i++) {
            const a = sp[i], b = sp[i + 1];
            if (fin(a.f) === fin(b.f)) continue;
            const [finX, nanX] = fin(a.f) ? [a.x, b.x] : [b.x, a.x];
            const edge = Numerics.domainEdge(g, finX, nanX);
            for (let k = 1; k <= 18; k++) evaluate(edge + (finX - edge) * pow10(-k));
        }
        sp = sortedProbes();

        // 4. Klammern (benachbarte endliche Werte mit Vorzeichenwechsel), nächstgelegene zuerst
        const brackets = [];
        for (let i = 0; i < sp.length - 1; i++) {
            const a = sp[i], b = sp[i + 1];
            if (fin(a.f) && fin(b.f) && a.f !== 0 && b.f !== 0 && (a.f < 0) !== (b.f < 0)) {
                brackets.push([[a.x, a.f], [b.x, b.f]]);
            }
        }
        brackets.sort(byLess((p, q) => Math.abs((p[0][0] + p[1][0]) / 2 - x0) < Math.abs((q[0][0] + q[1][0]) / 2 - x0)));
        let firstReversal = null;
        for (const br of brackets.slice(0, 8)) {
            const r = refine(br[0][0], br[0][1], br[1][0], br[1][1]);
            if (r.status === SOLVE.root) return r;
            if (firstReversal === null) firstReversal = r;
        }
        if (firstReversal !== null) return firstReversal;

        // 5. kein Vorzeichenwechsel: kleinstes |f| melden
        let best = null;
        for (const p of probes) {
            if (!fin(p.f)) continue;
            if (best === null || Math.abs(p.f) < Math.abs(best.f)) best = p;
        }
        if (best === null) return result(x0, f0, SOLVE.failed);
        if (Math.abs(best.f) < 1e-12 * smax(1, Math.abs(fin(f0) ? f0 : 1)) && (best.f !== 0 || isolatedZero(best.x)) &&
            Math.abs(best.x) < 1e12) {
            return result(best.x, best.f, SOLVE.root);
        }
        return result(best.x, best.f, SOLVE.extremum);
    },
};

// MARK: - Kurvenanalyse

export const FEATURE = {
    zero: 'zero', yIntercept: 'yIntercept', maximum: 'maximum', minimum: 'minimum',
    inflection: 'inflection', saddle: 'saddle', intersection: 'intersection',
};

/// Name des Merkmals („Nullstelle“, „Hochpunkt“ …)
export function featureName(kind) {
    switch (kind) {
    case FEATURE.zero: return 'Nullstelle';
    case FEATURE.yIntercept: return 'Schnittpunkt mit der y-Achse';
    case FEATURE.maximum: return 'Hochpunkt';
    case FEATURE.minimum: return 'Tiefpunkt';
    case FEATURE.inflection: return 'Wendepunkt';
    case FEATURE.saddle: return 'Sattelpunkt';
    case FEATURE.intersection: return 'Schnittpunkt';
    default: return '';
    }
}

/// Kürzel des Merkmals („N“, „Sᵧ“, „H“ …)
export function featureShort(kind) {
    switch (kind) {
    case FEATURE.zero: return 'N';
    case FEATURE.yIntercept: return 'Sᵧ';
    case FEATURE.maximum: return 'H';
    case FEATURE.minimum: return 'T';
    case FEATURE.inflection: return 'W';
    case FEATURE.saddle: return 'SP';
    case FEATURE.intersection: return 'S';
    default: return '';
    }
}

const SUBSCRIPT_DIGITS = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];

/// Tiefgestellte Ziffern: 12 → „₁₂“ (Minus → „₋“)
export function subscripted(n) {
    let s = '';
    for (const ch of String(n)) {
        if (ch >= '0' && ch <= '9') s += SUBSCRIPT_DIGITS[ch.charCodeAt(0) - 48];
        else if (ch === '-') s += '₋';
        else s += ch;
    }
    return s;
}

/// Merkmal einer Kurve (wie struct Feature in Swift); id und shortName werden wie dort berechnet.
/// index: 1, 2, … (0 = einziger dieser Art)
export function makeFeature({ kind, x, y, fn, function: fnAlt, other = null, index = 0 }) {
    return {
        kind,
        x,
        y,
        function: fn ?? fnAlt ?? '',
        other: other ?? null,
        index,
        get id() { return `${this.kind}|${this.function}|${this.other ?? ''}|${this.index}`; },
        /// Kurzname wie „N₁“, „H“, „S₂“
        get shortName() { return featureShort(this.kind) + (this.index > 0 ? subscripted(this.index) : ''); },
    };
}

export const CurveAnalysis = {

    /// Nullstellen von h in [a, b] (Vorzeichenwechsel, Berührpunkte, Definitionsränder)
    zeros(h, dh, a, b, n, yScale) {
        if (!(a < b && n > 4)) return [];
        const dx = (b - a) / n;
        const xs = new Array(n + 1).fill(0);
        const ys = new Array(n + 1).fill(0);
        let maxAbs = 0;
        for (let i = 0; i <= n; i++) {
            const x = a + i * dx;
            xs[i] = x;
            const y = h(x);
            ys[i] = y;
            if (fin(y)) maxAbs = smax(maxAbs, Math.abs(y));
        }
        const scale = smax(yScale, 1e-300);
        // identisch null (z. B. zwei gleiche Graphen) → keine einzelnen Punkte
        if (maxAbs <= 1e-12 * scale) return [];
        const floorAbs = 1e-11 * maxAbs;
        const roots = [];

        // exakte Nullen außerhalb von Nullplateaus
        for (let i = 0; i <= n; i++) {
            if (ys[i] !== 0) continue;
            const l = i > 0 ? ys[i - 1] : 1, r = i < n ? ys[i + 1] : 1;
            if (l === 0 || r === 0) continue;
            roots.push(xs[i]);
        }
        // Vorzeichenwechsel (winzige Werte = Rauschen überbrücken)
        let lastIdx = null;
        for (let i = 0; i <= n; i++) {
            const v = ys[i];
            if (!fin(v)) { lastIdx = null; continue; }
            if (Math.abs(v) <= floorAbs) continue;
            if (lastIdx !== null && (ys[lastIdx] < 0) !== (v < 0)) {
                const li = lastIdx;
                const r = Numerics.brent(h, xs[li], xs[i], ys[li], v);
                if (r !== null) {
                    const fr = h(r);
                    const ref = smax(Math.abs(ys[li]), Math.abs(v));
                    if (fin(fr) && Math.abs(fr) <= 1e-6 * ref + 1e-12 * scale) roots.push(r);
                }
            }
            lastIdx = i;
        }
        // Ränder des Definitionsbereichs (z. B. √x bei 0)
        for (let i = 0; i < n; i++) {
            const f0 = fin(ys[i]), f1 = fin(ys[i + 1]);
            if (f0 === f1) continue;
            const edge = f0 ? Numerics.domainEdge(h, xs[i], xs[i + 1])
                : Numerics.domainEdge(h, xs[i + 1], xs[i]);
            const fe = h(edge);
            if (fin(fe) && Math.abs(fe) <= 1e-6 * scale) roots.push(edge);
        }
        // Berührpunkte (doppelte Nullstellen): Extremstellen von h mit h ≈ 0
        if (dh) {
            for (const [x] of CurveAnalysis.signChangeRoots(dh, xs)) {
                const v = h(x);
                if (fin(v) && Math.abs(v) <= 1e-9 * scale) roots.push(x);
            }
        } else {
            for (let i = 1; i < n; i++) {
                const y0 = ys[i - 1], y1 = ys[i], y2 = ys[i + 1];
                if (!(fin(y0) && fin(y1) && fin(y2))) continue;
                if (!(Math.abs(y1) < Math.abs(y0) && Math.abs(y1) <= Math.abs(y2) &&
                      (y0 < 0) === (y1 < 0) && (y1 < 0) === (y2 < 0))) continue;
                const xm = CurveAnalysis.goldenMin((t) => Math.abs(h(t)), xs[i - 1], xs[i + 1]);
                if (Math.abs(h(xm)) <= 1e-9 * scale) roots.push(xm);
            }
        }
        roots.sort(byLess((p, q) => p < q));
        const out = [];
        for (const r of roots) {
            if (out.length > 0 && Math.abs(r - out[out.length - 1]) <= 1e-7 * (b - a) + 1e-13) continue;
            out.push(r);
        }
        return out;
    },

    /// Stellen mit Vorzeichenwechsel von g, dazu die Richtung (true = von − nach +) → [[x, rising]]
    signChangeRoots(g, xs) {
        const gs = xs.map((x) => g(x));
        let maxAbs = 0;
        for (const v of gs) if (fin(v)) maxAbs = smax(maxAbs, Math.abs(v));
        if (maxAbs === 0) return [];
        const floorAbs = 1e-9 * maxAbs;
        const out = [];
        let lastIdx = null;
        for (let i = 0; i < xs.length; i++) {
            const v = gs[i];
            if (!fin(v)) { lastIdx = null; continue; }
            if (Math.abs(v) <= floorAbs) continue;
            if (lastIdx !== null && (gs[lastIdx] < 0) !== (v < 0)) {
                const li = lastIdx;
                const r = Numerics.brent(g, xs[li], xs[i], gs[li], v);
                if (r !== null) out.push([r, gs[li] < 0]);
            }
            lastIdx = i;
        }
        return out;
    },

    /// Minimum von f in [a, b] (Goldener Schnitt)
    goldenMin(f, a0, b0) {
        const gr = (Math.sqrt(5) - 1) / 2;
        let a = a0, b = b0;
        let c = b - gr * (b - a), d = a + gr * (b - a);
        let fc = f(c), fd = f(d);
        for (let it = 0; it < 100; it++) {
            if (Math.abs(b - a) <= 1e-15 * smax(1, Math.abs(a))) break;
            if (fc < fd) {
                b = d; d = c; fd = fc;
                c = b - gr * (b - a); fc = f(c);
            } else {
                a = c; c = d; fc = fd;
                d = a + gr * (b - a); fd = f(d);
            }
        }
        return 0.5 * (a + b);
    },

    /// Stetig an der Stelle x (keine Polstelle, kein Sprung)?
    isContinuous(f, x, y, span, yScale) {
        const delta = 1e-6 * span;
        const yl = f(x - delta), yr = f(x + delta);
        if (!(fin(yl) && fin(yr))) return false;
        const tol = smax(1e-3 * yScale, 1e-6 * Math.abs(y));
        return Math.abs(yl - y) < tol && Math.abs(yr - y) < tol;
    },

    /// Rundungsreste (z. B. 1e-16) auf 0 setzen
    snap(v, scale) {
        return Math.abs(v) < 1e-10 * smax(scale, 1e-300) ? 0 : v;
    },

    /// snap auf x und y aller Merkmale
    snapAll(fs, span, yScale) {
        return fs.map((f) => makeFeature({
            kind: f.kind, x: CurveAnalysis.snap(f.x, span), y: CurveAnalysis.snap(f.y, yScale),
            fn: f.function, other: f.other, index: f.index,
        }));
    },

    /// Alle Merkmale einer Funktion im sichtbaren Bereich.
    /// inp = { name, f, d1, d2, exact } (d1/d2 dürfen null sein; exact = exakte Ableitungen)
    analyze(inp, xMin, xMax, yMin, yMax, samples, inflections) {
        const span = xMax - xMin;
        const yScale = smax(yMax - yMin, 1e-300);
        const feats = [];
        const f = inp.f;
        const exact = inp.exact ?? inp.exactDerivatives ?? false;

        // Nullstellen
        const zs = CurveAnalysis.zeros(f, inp.d1 ?? null, xMin, xMax, samples, yScale);
        zs.forEach((x, i) => {
            feats.push(makeFeature({ kind: FEATURE.zero, x, y: 0, fn: inp.name, index: zs.length > 1 ? i + 1 : 0 }));
        });
        // y-Achsenabschnitt
        if (xMin <= 0 && xMax >= 0) {
            const y0 = f(0);
            if (fin(y0)) {
                feats.push(makeFeature({ kind: FEATURE.yIntercept, x: 0, y: Math.abs(y0) < 1e-15 * yScale ? 0 : y0, fn: inp.name }));
            }
        }
        const d1 = inp.d1;
        if (!d1) return CurveAnalysis.snapAll(feats, span, yScale);
        const n = samples;
        const dx = span / n;
        const xs = [];
        for (let i = 0; i <= n; i++) xs.push(xMin + i * dx);

        // Extrema über Vorzeichenwechsel von f'
        const maxima = [], minima = [];
        for (const [x, rising] of CurveAnalysis.signChangeRoots(d1, xs)) {
            const y = f(x);
            if (!(fin(y) && CurveAnalysis.isContinuous(f, x, y, span, yScale))) continue;
            if (rising) minima.push([x, y]); else maxima.push([x, y]);
        }
        maxima.forEach((p, i) => {
            feats.push(makeFeature({ kind: FEATURE.maximum, x: p[0], y: p[1], fn: inp.name, index: maxima.length > 1 ? i + 1 : 0 }));
        });
        minima.forEach((p, i) => {
            feats.push(makeFeature({ kind: FEATURE.minimum, x: p[0], y: p[1], fn: inp.name, index: minima.length > 1 ? i + 1 : 0 }));
        });

        // Wende- und Sattelpunkte über Vorzeichenwechsel von f''
        const d2 = inp.d2;
        if (inflections && exact && d2) {
            const ws = [], sps = [];
            const slopeScale = smax(yScale / span, 1e-300);
            for (const [x] of CurveAnalysis.signChangeRoots(d2, xs)) {
                const y = f(x);
                if (!(fin(y) && CurveAnalysis.isContinuous(f, x, y, span, yScale))) continue;
                const s = d1(x);
                if (fin(s) && Math.abs(s) <= 1e-7 * smax(1, slopeScale)) {
                    sps.push([x, y]);
                } else {
                    ws.push([x, y]);
                }
            }
            ws.forEach((p, i) => {
                feats.push(makeFeature({ kind: FEATURE.inflection, x: p[0], y: p[1], fn: inp.name, index: ws.length > 1 ? i + 1 : 0 }));
            });
            sps.forEach((p, i) => {
                feats.push(makeFeature({ kind: FEATURE.saddle, x: p[0], y: p[1], fn: inp.name, index: sps.length > 1 ? i + 1 : 0 }));
            });
        }
        return CurveAnalysis.snapAll(feats, span, yScale);
    },

    /// Schnittpunkte zweier Graphen im sichtbaren Bereich → [[x, y]]
    intersections(a, b, xMin, xMax, yMin, yMax, samples) {
        const fa = a.f, fb = b.f;
        const h = (x) => fa(x) - fb(x);
        let dh = null;
        if (a.d1 && b.d1) {
            const da = a.d1, db = b.d1;
            dh = (x) => da(x) - db(x);
        }
        const span = xMax - xMin;
        const yScale = smax(yMax - yMin, 1e-300);
        const xs = CurveAnalysis.zeros(h, dh, xMin, xMax, samples, yScale);
        const out = [];
        for (const x of xs) {
            const y = fa(x);
            if (!(fin(y) && CurveAnalysis.isContinuous(fa, x, y, span, yScale) &&
                  CurveAnalysis.isContinuous(fb, x, fb(x), span, yScale))) continue;
            out.push([CurveAnalysis.snap(x, span), CurveAnalysis.snap(y, yScale)]);
        }
        return out;
    },
};
