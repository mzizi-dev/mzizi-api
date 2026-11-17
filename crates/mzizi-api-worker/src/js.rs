//! The few JavaScript semantics the API's contract depends on, reproduced
//! exactly: `String.prototype.trim`, `Number(…)`, `parseInt(…, 10)`,
//! `String(number)`, `encodeURIComponent`, and Hono's tolerant
//! `decodeURI` / `decodeURIComponent`. The TypeScript Worker answered with
//! these, so a query string or path segment means the same thing here.

use serde_json::{Number, Value};

/// ECMAScript WhiteSpace and LineTerminator: what `trim()` removes. Unlike
/// Rust's `char::is_whitespace`, it includes U+FEFF and excludes U+0085.
pub fn is_js_whitespace(c: char) -> bool {
    matches!(
        c,
        '\u{0009}'
            | '\u{000A}'
            | '\u{000B}'
            | '\u{000C}'
            | '\u{000D}'
            | '\u{0020}'
            | '\u{00A0}'
            | '\u{1680}'
            | '\u{2000}'
            ..='\u{200A}'
                | '\u{2028}'
                | '\u{2029}'
                | '\u{202F}'
                | '\u{205F}'
                | '\u{3000}'
                | '\u{FEFF}'
    )
}

/// `String.prototype.trim`.
pub fn trim(s: &str) -> &str {
    s.trim_matches(is_js_whitespace)
}

/// `Number(s)` for a string: `NaN` when it is not a numeric literal.
pub fn number(s: &str) -> f64 {
    let s = trim(s);
    if s.is_empty() {
        return 0.0;
    }
    match s {
        "Infinity" | "+Infinity" => return f64::INFINITY,
        "-Infinity" => return f64::NEG_INFINITY,
        _ => {}
    }
    let bytes = s.as_bytes();
    if bytes.len() > 2 && bytes[0] == b'0' {
        let radix = match bytes[1] {
            b'x' | b'X' => 16,
            b'o' | b'O' => 8,
            b'b' | b'B' => 2,
            _ => 0,
        };
        if radix != 0 {
            let mut n = 0f64;
            for c in s[2..].chars() {
                match c.to_digit(radix) {
                    Some(d) => n = n * f64::from(radix) + f64::from(d),
                    None => return f64::NAN,
                }
            }
            return n;
        }
    }
    if is_decimal_literal(s) {
        s.parse::<f64>().unwrap_or(f64::NAN)
    } else {
        f64::NAN
    }
}

/// StrDecimalLiteral without `Infinity`: `[+-]? (d+ (. d*)? | . d+) ([eE] [+-]? d+)?`.
fn is_decimal_literal(s: &str) -> bool {
    let b = s.as_bytes();
    let mut i = 0;
    if i < b.len() && (b[i] == b'+' || b[i] == b'-') {
        i += 1;
    }
    let int_start = i;
    while i < b.len() && b[i].is_ascii_digit() {
        i += 1;
    }
    let mut digits = i - int_start;
    if i < b.len() && b[i] == b'.' {
        i += 1;
        let frac_start = i;
        while i < b.len() && b[i].is_ascii_digit() {
            i += 1;
        }
        digits += i - frac_start;
    }
    if digits == 0 {
        return false;
    }
    if i < b.len() && (b[i] == b'e' || b[i] == b'E') {
        i += 1;
        if i < b.len() && (b[i] == b'+' || b[i] == b'-') {
            i += 1;
        }
        let exp_start = i;
        while i < b.len() && b[i].is_ascii_digit() {
            i += 1;
        }
        if i == exp_start {
            return false;
        }
    }
    i == b.len()
}

/// `parseInt(s, 10)`: `None` for `NaN`.
pub fn parse_int(s: &str) -> Option<f64> {
    let s = s.trim_start_matches(is_js_whitespace);
    let (negative, rest) = match s.as_bytes().first() {
        Some(b'-') => (true, &s[1..]),
        Some(b'+') => (false, &s[1..]),
        _ => (false, s),
    };
    let end = rest
        .find(|c: char| !c.is_ascii_digit())
        .unwrap_or(rest.len());
    if end == 0 {
        return None;
    }
    let n: f64 = rest[..end].parse().ok()?;
    Some(if negative { -n } else { n })
}

/// `Number.isInteger(n)`.
pub fn is_integer(n: f64) -> bool {
    n.is_finite() && n.fract() == 0.0
}

/// `String(n)` for a number (Number::toString with radix 10).
pub fn number_to_string(n: f64) -> String {
    if n.is_nan() {
        return "NaN".into();
    }
    if n == 0.0 {
        return "0".into();
    }
    if n.is_infinite() {
        return if n > 0.0 { "Infinity" } else { "-Infinity" }.into();
    }
    let sign = if n < 0.0 { "-" } else { "" };
    // `{:e}` gives the shortest digits that round-trip, as JS does.
    let sci = format!("{:e}", n.abs());
    let (mantissa, exp) = sci.split_once('e').unwrap_or((&sci, "0"));
    let digits: String = mantissa.chars().filter(char::is_ascii_digit).collect();
    let k = digits.len() as i32;
    let n_exp = exp.parse::<i32>().unwrap_or(0) + 1;
    let body = if k <= n_exp && n_exp <= 21 {
        format!("{digits}{}", "0".repeat((n_exp - k) as usize))
    } else if 0 < n_exp && n_exp <= 21 {
        format!(
            "{}.{}",
            &digits[..n_exp as usize],
            &digits[n_exp as usize..]
        )
    } else if -6 < n_exp && n_exp <= 0 {
        format!("0.{}{digits}", "0".repeat((-n_exp) as usize))
    } else {
        let e = n_exp - 1;
        let e = if e >= 0 {
            format!("+{e}")
        } else {
            e.to_string()
        };
        if k == 1 {
            format!("{digits}e{e}")
        } else {
            format!("{}.{}e{e}", &digits[..1], &digits[1..])
        }
    };
    format!("{sign}{body}")
}

/// A JSON number as `JSON.stringify` writes a JS number: integers without a
/// fraction (and `-0` as `0`).
pub fn json_number(n: f64) -> Number {
    if is_integer(n) && n.abs() < 9.007_199_254_740_992e15 {
        Number::from(n as i64)
    } else {
        Number::from_f64(n).unwrap_or_else(|| Number::from(0))
    }
}

/// `encodeURIComponent`.
pub fn encode_uri_component(s: &str) -> String {
    const KEEP: &[u8] = b"-_.!~*'()";
    let mut out = String::with_capacity(s.len());
    for &b in s.as_bytes() {
        if b.is_ascii_alphanumeric() || KEEP.contains(&b) {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

/// The characters `decodeURI` leaves encoded.
const URI_RESERVED: &str = ";/?:@&=+$,#";

/// ECMAScript `Decode(string, reservedSet)`: `Err` where JS throws `URIError`.
fn decode(s: &str, reserved: &str) -> Result<String, ()> {
    let b = s.as_bytes();
    let hex = |i: usize| -> Result<u8, ()> {
        let h = b.get(i + 1..i + 3).ok_or(())?;
        let h = std::str::from_utf8(h).map_err(|_| ())?;
        u8::from_str_radix(h, 16).map_err(|_| ())
    };
    let mut out = String::with_capacity(s.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] != b'%' {
            let c = s[i..].chars().next().ok_or(())?;
            out.push(c);
            i += c.len_utf8();
            continue;
        }
        let first = hex(i)?;
        if first < 0x80 {
            let c = first as char;
            if reserved.contains(c) {
                out.push_str(&s[i..i + 3]);
            } else {
                out.push(c);
            }
            i += 3;
            continue;
        }
        let n = match first {
            0xC0..=0xDF => 2,
            0xE0..=0xEF => 3,
            0xF0..=0xF7 => 4,
            _ => return Err(()),
        };
        let mut bytes = vec![first];
        for k in 1..n {
            let at = i + 3 * k;
            if b.get(at) != Some(&b'%') {
                return Err(());
            }
            let cont = hex(at)?;
            if cont & 0xC0 != 0x80 {
                return Err(());
            }
            bytes.push(cont);
        }
        out.push_str(std::str::from_utf8(&bytes).map_err(|_| ())?);
        i += 3 * n;
    }
    Ok(out)
}

/// Hono's `tryDecode`: decode the whole string, or, if that throws, each run
/// of `%XX` escapes on its own, keeping the runs that still fail.
fn try_decode(s: &str, reserved: &str) -> String {
    if let Ok(d) = decode(s, reserved) {
        return d;
    }
    let b = s.as_bytes();
    let is_escape = |i: usize| {
        i + 2 < b.len()
            && b[i] == b'%'
            && b[i + 1].is_ascii_hexdigit()
            && b[i + 2].is_ascii_hexdigit()
    };
    let mut out = String::with_capacity(s.len());
    let mut i = 0;
    while i < b.len() {
        if is_escape(i) {
            let start = i;
            while is_escape(i) {
                i += 3;
            }
            let run = &s[start..i];
            out.push_str(&decode(run, reserved).unwrap_or_else(|_| run.to_owned()));
        } else {
            let c = s[i..].chars().next().unwrap_or('\u{FFFD}');
            out.push(c);
            i += c.len_utf8().max(1);
        }
    }
    out
}

/// Hono's `getPath`: the path the router matches, `decodeURI`d (with `%25`
/// kept, so a param decodes it exactly once).
pub fn hono_path(raw: &str) -> String {
    if !raw.contains('%') {
        return raw.to_owned();
    }
    try_decode(&raw.replace("%25", "%2525"), URI_RESERVED)
}

/// Hono's `tryDecodeURIComponent`, applied to every path parameter.
pub fn decode_param(s: &str) -> String {
    if s.contains('%') {
        try_decode(s, "")
    } else {
        s.to_owned()
    }
}

/// JavaScript truthiness of a JSON value.
pub fn truthy(v: Option<&Value>) -> bool {
    match v {
        None | Some(Value::Null) => false,
        Some(Value::Bool(b)) => *b,
        Some(Value::Number(n)) => n.as_f64().is_some_and(|f| f != 0.0 && !f.is_nan()),
        Some(Value::String(s)) => !s.is_empty(),
        Some(Value::Array(_) | Value::Object(_)) => true,
    }
}

/// `String(v)` for a JSON value (`undefined` when absent).
pub fn to_js_string(v: Option<&Value>) -> String {
    match v {
        None => "undefined".into(),
        Some(Value::Null) => "null".into(),
        Some(Value::Bool(b)) => b.to_string(),
        Some(Value::Number(n)) => number_to_string(n.as_f64().unwrap_or(f64::NAN)),
        Some(Value::String(s)) => s.clone(),
        Some(Value::Array(a)) => a
            .iter()
            .map(|x| match x {
                Value::Null => String::new(),
                other => to_js_string(Some(other)),
            })
            .collect::<Vec<_>>()
            .join(","),
        Some(Value::Object(_)) => "[object Object]".into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn number_follows_js() {
        assert_eq!(number(" 5 "), 5.0);
        assert_eq!(number(""), 0.0);
        assert_eq!(number("0x10"), 16.0);
        assert_eq!(number("1e2"), 100.0);
        assert_eq!(number(".5"), 0.5);
        assert_eq!(number("5."), 5.0);
        assert!(number("abc").is_nan());
        assert!(number("inf").is_nan());
        assert!(number("1_0").is_nan());
        assert!(number("-0x10").is_nan());
    }

    #[test]
    fn parse_int_follows_js() {
        assert_eq!(parse_int("  42abc"), Some(42.0));
        assert_eq!(parse_int("-7"), Some(-7.0));
        assert_eq!(parse_int("1.5"), Some(1.0));
        assert_eq!(parse_int("abc"), None);
        assert_eq!(parse_int(""), None);
    }

    #[test]
    fn number_to_string_follows_js() {
        for (n, s) in [
            (1.0, "1"),
            (-1.5, "-1.5"),
            (1e21, "1e+21"),
            (1e20, "100000000000000000000"),
            (1.5e-7, "1.5e-7"),
            (0.000001, "0.000001"),
            (123.456, "123.456"),
            (-0.0, "0"),
        ] {
            assert_eq!(number_to_string(n), s);
        }
    }

    #[test]
    fn decodes_like_hono() {
        assert_eq!(hono_path("/v1/%75i"), "/v1/ui");
        assert_eq!(hono_path("/a%2Fb"), "/a%2Fb");
        assert_eq!(hono_path("/a%25b"), "/a%25b");
        assert_eq!(decode_param("a%25b"), "a%b");
        assert_eq!(decode_param("a%2Fb"), "a/b");
        assert_eq!(decode_param("%E0%A4%A"), "%E0%A4%A");
        assert_eq!(decode_param("%FF%20x"), "%FF%20x");
        assert_eq!(decode_param("%FF-%20x"), "%FF- x");
        assert_eq!(decode_param("caf%C3%A9"), "café");
    }

    #[test]
    fn encodes_like_js() {
        assert_eq!(encode_uri_component("a b/c~é"), "a%20b%2Fc~%C3%A9");
    }

    #[test]
    fn trims_like_js() {
        assert_eq!(trim("\u{FEFF} x \u{3000}"), "x");
        assert_eq!(trim("\u{0085}x"), "\u{0085}x");
    }
}
