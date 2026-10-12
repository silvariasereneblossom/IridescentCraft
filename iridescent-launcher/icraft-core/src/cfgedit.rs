//! Config files read *with positions*, so one value can be changed in place.
//!
//! The Server Customizer changes single values in files other programs own:
//! Forge / night-config TOML, the legacy Forge `.cfg` format, JSON (JSON5
//! comments tolerated) and `.properties`. A parse-and-reserialise round trip
//! would drop every comment and reorder the file, and the `toml` crate in this
//! workspace is parse-only anyway. So these are small scanners of our own that
//! record, for every key, the byte range its value occupies. Changing a value
//! replaces that range and nothing else: comments, order, indentation and line
//! endings stay byte for byte.
//!
//! What a value is allowed to be comes from the file itself: Forge writes
//! `#Range: 1 ~ 256` and `#Allowed Values: A, B` above each key, the legacy
//! format writes `[range: 0 ~ 256000, default: 0]`. [`Entry::encode`] checks a
//! new value against them, because Forge answers an out-of-range value by
//! resetting the key to its default and renaming the file to `.bak`.
//!
//! [`Document::set`] re-reads the edited text and refuses the change unless
//! every other key still reads exactly as before.

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Format {
    Toml,
    /// The legacy Forge format: `category { I:key=value }`.
    Cfg,
    Json,
    Properties,
}

impl Format {
    pub fn of_path(rel: &str) -> Option<Format> {
        let lower = rel.to_ascii_lowercase();
        if lower.ends_with(".toml") {
            Some(Format::Toml)
        } else if lower.ends_with(".cfg") {
            Some(Format::Cfg)
        } else if lower.ends_with(".json") || lower.ends_with(".json5") {
            Some(Format::Json)
        } else if lower.ends_with(".properties") {
            Some(Format::Properties)
        } else {
            None
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Kind {
    Bool,
    Int,
    Float,
    Text,
    /// An array. Shown, not edited here.
    List,
    /// Anything else (an inline table, a date, `null`). Shown, not edited.
    Other,
}

/// One `key = value` of a file.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Entry {
    /// The whole path: `world_generation.tin.small.perChunk`.
    pub key: String,
    /// The table / category the key sits in (`""` at the top level).
    pub section: String,
    pub name: String,
    /// The value exactly as written (a TOML or JSON string keeps its quotes).
    pub raw: String,
    pub kind: Kind,
    /// The comment lines above the key, without their `#`.
    pub comment: String,
    pub min: Option<f64>,
    pub max: Option<f64>,
    pub allowed: Vec<String>,
    /// The mod's own default, where the file states it.
    pub default: Option<String>,
    /// `raw` is a quoted string.
    pub quoted: bool,
    #[serde(skip)]
    start: usize,
    #[serde(skip)]
    end: usize,
}

impl Entry {
    pub fn editable(&self) -> bool {
        matches!(self.kind, Kind::Bool | Kind::Int | Kind::Float | Kind::Text)
    }

    /// The value as a person reads it: a quoted string without its quotes.
    pub fn value(&self) -> String {
        self.show(&self.raw)
    }

    /// Any raw value of this key, as a person reads it.
    pub fn show(&self, raw: &str) -> String {
        if self.quoted {
            unquote(raw)
        } else {
            raw.trim().to_string()
        }
    }

    /// What `input` (as a person types it) looks like in the file, or why it
    /// is not a value this key can take.
    pub fn encode(&self, input: &str) -> Result<String, String> {
        let input = input.trim();
        match self.kind {
            Kind::Bool => match input.to_ascii_lowercase().as_str() {
                "true" | "on" | "yes" => Ok("true".to_string()),
                "false" | "off" | "no" => Ok("false".to_string()),
                _ => Err(format!("`{}` is true or false, not `{input}`", self.name)),
            },
            Kind::Int => {
                let n: i64 = input
                    .replace('_', "")
                    .parse()
                    .map_err(|_| format!("`{}` takes a whole number, not `{input}`", self.name))?;
                self.check_range(n as f64)?;
                Ok(n.to_string())
            }
            Kind::Float => {
                let f: f64 = input.parse().map_err(|_| format!("`{}` takes a number, not `{input}`", self.name))?;
                if !f.is_finite() {
                    return Err(format!("`{}` takes a finite number", self.name));
                }
                self.check_range(f)?;
                Ok(fmt_float(f))
            }
            Kind::Text => {
                if !self.allowed.is_empty() && !self.allowed.iter().any(|a| a == input) {
                    return Err(format!("`{}` must be one of: {}", self.name, self.allowed.join(", ")));
                }
                if input.contains('\n') || input.contains('\r') {
                    return Err(format!("`{}` cannot contain a line break", self.name));
                }
                Ok(if self.quoted { quote(input) } else { input.to_string() })
            }
            Kind::List | Kind::Other => {
                Err(format!("`{}` is a list or a table: it is shown here but has to be edited in the file", self.name))
            }
        }
    }

    fn check_range(&self, v: f64) -> Result<(), String> {
        if let Some(min) = self.min {
            if v < min {
                return Err(format!("`{}` cannot be less than {}", self.name, fmt_bound(min)));
            }
        }
        if let Some(max) = self.max {
            if v > max {
                return Err(format!("`{}` cannot be more than {}", self.name, fmt_bound(max)));
            }
        }
        Ok(())
    }

    /// "1 to 256", "at least 0", "" when the file gives no range.
    pub fn range_text(&self) -> String {
        match (self.min, self.max) {
            (Some(a), Some(b)) => format!("{} to {}", fmt_bound(a), fmt_bound(b)),
            (Some(a), None) => format!("at least {}", fmt_bound(a)),
            (None, Some(b)) => format!("at most {}", fmt_bound(b)),
            (None, None) => String::new(),
        }
    }
}

/// Two raw values that mean the same (`1.0` and `1`, or equal text).
pub fn same_value(a: &str, b: &str) -> bool {
    let (a, b) = (a.trim(), b.trim());
    a == b || matches!((a.parse::<f64>(), b.parse::<f64>()), (Ok(x), Ok(y)) if x == y)
}

/// A float the way TOML wants one: always with a fraction or an exponent.
fn fmt_float(f: f64) -> String {
    let s = format!("{f}");
    if s.contains('.') || s.contains('e') || s.contains('E') {
        s
    } else {
        format!("{s}.0")
    }
}

fn fmt_bound(v: f64) -> String {
    if v.fract() == 0.0 && v.abs() < 9.0e15 {
        format!("{}", v as i64)
    } else {
        format!("{v}")
    }
}

/// A config file, read.
#[derive(Debug, Clone)]
pub struct Document {
    pub format: Format,
    text: String,
    pub entries: Vec<Entry>,
    /// Every table / category, with the comment above it.
    pub sections: Vec<(String, String)>,
    /// What could not be read. The entries are still good; a file with
    /// problems is shown, and edits to it are refused only if they would
    /// disturb another key (see [`Document::set`]).
    pub problems: Vec<String>,
    /// JSON only: values inside arrays are entries too (see
    /// [`Document::parse_json_deep`]).
    deep: bool,
}

impl Document {
    pub fn parse(format: Format, text: &str) -> Document {
        Document::parse_as(format, text, false)
    }

    /// JSON with the values inside arrays addressable as well, by position:
    /// `placement[0].count`, `placement[2].height.min_inclusive.absolute`.
    /// Datapack files keep their numbers there (a placed feature is a list of
    /// placement steps). An array is then no entry of its own, and an object
    /// that says what it is (`"type": "minecraft:count"`) carries that as its
    /// section's comment, since a position alone tells a reader nothing.
    pub fn parse_json_deep(text: &str) -> Document {
        Document::parse_as(Format::Json, text, true)
    }

    fn parse_as(format: Format, text: &str, deep: bool) -> Document {
        let mut doc = Document { format, text: text.to_string(), entries: Vec::new(), sections: Vec::new(), problems: Vec::new(), deep };
        match format {
            Format::Toml => parse_toml(text, &mut doc),
            Format::Cfg => parse_cfg(text, &mut doc),
            Format::Json => parse_json(text, &mut doc),
            Format::Properties => parse_properties(text, &mut doc),
        }
        doc
    }

    pub fn text(&self) -> &str {
        &self.text
    }

    pub fn get(&self, key: &str) -> Option<&Entry> {
        self.entries.iter().find(|e| e.key == key)
    }

    /// Replace one value with `raw` (already in file form: see
    /// [`Entry::encode`]). `Ok(false)` when it already reads that way. The
    /// edit is refused, and nothing changes, unless the edited text reads back
    /// with that key at `raw` and every other key as it was.
    pub fn set(&mut self, key: &str, raw: &str) -> Result<bool, String> {
        let at = self.entries.iter().position(|e| e.key == key).ok_or_else(|| format!("there is no `{key}` in the file"))?;
        let entry = &self.entries[at];
        if !entry.editable() {
            return Err(format!("`{key}` is a list or a table and cannot be changed here"));
        }
        if raw.contains('\n') || raw.contains('\r') {
            return Err("a value cannot contain a line break".to_string());
        }
        if entry.raw == raw {
            return Ok(false);
        }
        let mut text = self.text.clone();
        text.replace_range(entry.start..entry.end, raw);
        let fresh = Document::parse_as(self.format, &text, self.deep);
        // In TOML and JSON the way a value is written is its type: a number
        // stays a number, a string a string. The other two formats are untyped.
        let typed = matches!(self.format, Format::Toml | Format::Json);
        let class = |k: Kind| if k == Kind::Float { Kind::Int } else { k };
        let intact = fresh.entries.len() == self.entries.len()
            && fresh.entries.iter().zip(&self.entries).enumerate().all(|(i, (new, old))| {
                new.key == old.key
                    && if i == at {
                        new.raw == raw && new.editable() && (!typed || class(new.kind) == class(old.kind))
                    } else {
                        new.raw == old.raw
                    }
            });
        if !intact {
            return Err(format!("`{raw}` is not a value `{key}` can hold, or writing it would disturb another setting; nothing was changed"));
        }
        *self = fresh;
        Ok(true)
    }

    fn problem(&mut self, what: String) {
        if self.problems.len() < 20 {
            self.problems.push(what);
        }
    }

    #[allow(clippy::too_many_arguments)]
    fn push(&mut self, section: &str, name: String, raw: &str, kind: Kind, quoted: bool, span: (usize, usize), comment: &[String]) {
        let meta = parse_meta(comment);
        let key = if section.is_empty() { name.clone() } else { format!("{section}.{name}") };
        self.entries.push(Entry {
            key,
            section: section.to_string(),
            name,
            raw: raw.to_string(),
            kind,
            comment: comment.join("\n"),
            min: meta.min,
            max: meta.max,
            allowed: meta.allowed,
            default: meta.default,
            quoted,
            start: span.0,
            end: span.1,
        });
    }
}

// =============================================================================
// Shared scanning
// =============================================================================

/// (start, end) of every line; the end is before its `\n` or `\r\n`.
fn line_spans(text: &str) -> Vec<(usize, usize)> {
    let bytes = text.as_bytes();
    let mut out = Vec::new();
    let mut start = 0;
    for (i, b) in bytes.iter().enumerate() {
        if *b == b'\n' {
            let end = if i > start && bytes[i - 1] == b'\r' { i - 1 } else { i };
            out.push((start, end));
            start = i + 1;
        }
    }
    if start < bytes.len() {
        out.push((start, bytes.len()));
    }
    out
}

/// Bytes of indentation (and a byte-order mark) at the start of a line.
fn lead(line: &str) -> usize {
    line.len() - line.trim_start_matches(|c: char| c == ' ' || c == '\t' || c == '\u{feff}').len()
}

/// The first `target` outside quotes; a `#` outside quotes ends the search.
fn find_unquoted(s: &str, target: u8) -> Option<usize> {
    let b = s.as_bytes();
    let mut j = 0;
    while j < b.len() {
        match b[j] {
            b'"' => {
                j += 1;
                while j < b.len() && b[j] != b'"' {
                    if b[j] == b'\\' {
                        j += 1;
                    }
                    j += 1;
                }
            }
            b'\'' => {
                j += 1;
                while j < b.len() && b[j] != b'\'' {
                    j += 1;
                }
            }
            c if c == target => return Some(j),
            b'#' => return None,
            _ => {}
        }
        j += 1;
    }
    None
}

/// Where the bracket opened at `start` closes (one past it), strings and, for
/// TOML, `#` comments skipped. The end of the text when it never closes.
fn balanced_end(text: &str, start: usize, open: u8, close: u8, hash_comments: bool) -> usize {
    let b = text.as_bytes();
    let mut depth = 0usize;
    let mut j = start;
    while j < b.len() {
        match b[j] {
            b'"' => {
                j += 1;
                while j < b.len() && b[j] != b'"' {
                    if b[j] == b'\\' {
                        j += 1;
                    }
                    j += 1;
                }
            }
            b'\'' => {
                j += 1;
                while j < b.len() && b[j] != b'\'' {
                    j += 1;
                }
            }
            b'#' if hash_comments => {
                while j < b.len() && b[j] != b'\n' {
                    j += 1;
                }
                continue;
            }
            c if c == open => depth += 1,
            c if c == close => {
                depth = depth.saturating_sub(1);
                if depth == 0 {
                    return j + 1;
                }
            }
            _ => {}
        }
        j += 1;
    }
    b.len()
}

/// `a."b c".d` as its parts.
fn split_key(s: &str) -> Vec<String> {
    let mut parts = Vec::new();
    let mut cur = String::new();
    let mut quote: Option<char> = None;
    let mut chars = s.trim().chars();
    while let Some(c) = chars.next() {
        match quote {
            Some(q) if c == q => quote = None,
            Some('"') if c == '\\' => {
                if let Some(next) = chars.next() {
                    cur.push(next);
                }
            }
            Some(_) => cur.push(c),
            None if c == '"' || c == '\'' => quote = Some(c),
            None if c == '.' => parts.push(std::mem::take(&mut cur).trim().to_string()),
            None => cur.push(c),
        }
    }
    parts.push(cur.trim().to_string());
    parts
}

fn scalar_kind(raw: &str) -> Kind {
    let t = raw.trim();
    if t == "true" || t == "false" {
        return Kind::Bool;
    }
    let plain = t.replace('_', "");
    let digits = plain.strip_prefix('+').unwrap_or(plain.as_str());
    if digits.parse::<i64>().is_ok() {
        return Kind::Int;
    }
    if digits.parse::<f64>().is_ok() && digits.bytes().any(|b| b.is_ascii_digit()) {
        return Kind::Float;
    }
    Kind::Other
}

fn unquote(raw: &str) -> String {
    let t = raw.trim();
    if t.len() >= 2 && t.starts_with('\'') && t.ends_with('\'') {
        return t[1..t.len() - 1].to_string();
    }
    if !(t.len() >= 2 && t.starts_with('"') && t.ends_with('"')) {
        return t.to_string();
    }
    let mut out = String::new();
    let mut chars = t[1..t.len() - 1].chars();
    while let Some(c) = chars.next() {
        if c != '\\' {
            out.push(c);
            continue;
        }
        match chars.next() {
            Some('n') => out.push('\n'),
            Some('t') => out.push('\t'),
            Some('r') => out.push('\r'),
            Some('b') => out.push('\u{8}'),
            Some('f') => out.push('\u{c}'),
            Some('u') => {
                let hex: String = chars.by_ref().take(4).collect();
                out.push(u32::from_str_radix(&hex, 16).ok().and_then(char::from_u32).unwrap_or('\u{fffd}'));
            }
            Some(other) => out.push(other),
            None => {}
        }
    }
    out
}

fn quote(value: &str) -> String {
    let mut out = String::with_capacity(value.len() + 2);
    out.push('"');
    for c in value.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\t' => out.push_str("\\t"),
            '\r' => out.push_str("\\r"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

// =============================================================================
// What the comments say about a value
// =============================================================================

#[derive(Default)]
struct Meta {
    min: Option<f64>,
    max: Option<f64>,
    allowed: Vec<String>,
    default: Option<String>,
}

fn parse_meta(comment: &[String]) -> Meta {
    let mut meta = Meta::default();
    for line in comment {
        // ASCII lowercasing keeps every byte offset.
        let lower = line.to_ascii_lowercase();
        if let Some(p) = lower.find("range:") {
            let rest = &line[p + 6..];
            let rest = &rest[..rest.find(|c: char| c == ',' || c == ']').unwrap_or(rest.len())];
            let (min, max) = parse_range(rest);
            if min.is_some() || max.is_some() {
                meta.min = min;
                meta.max = max;
            }
        }
        if let Some(p) = lower.find("default:") {
            let rest = &line[p + 8..];
            let rest = rest[..rest.find(']').unwrap_or(rest.len())].trim();
            if !rest.is_empty() {
                meta.default = Some(rest.to_string());
            }
        }
        if let Some(p) = lower.find("allowed values:") {
            meta.allowed = line[p + 15..].split(',').map(|v| v.trim().to_string()).filter(|v| !v.is_empty()).collect();
        }
    }
    meta
}

/// `1 ~ 256`, `> 0` (Forge's way of writing "0 or more"), `< 5`, `2-6`.
fn parse_range(s: &str) -> (Option<f64>, Option<f64>) {
    let s = s.trim();
    let num = |t: &str| t.trim().trim_start_matches('=').trim().parse::<f64>().ok();
    if let Some(rest) = s.strip_prefix('>') {
        return (num(rest), None);
    }
    if let Some(rest) = s.strip_prefix('<') {
        return (None, num(rest));
    }
    if let Some((a, b)) = s.split_once('~') {
        return match (num(a), num(b)) {
            (Some(a), Some(b)) => (Some(a), Some(b)),
            _ => (None, None),
        };
    }
    for (p, c) in s.char_indices().skip(1) {
        if c == '-' {
            if let (Some(a), Some(b)) = (num(&s[..p]), num(&s[p + 1..])) {
                return (Some(a), Some(b));
            }
        }
    }
    (None, None)
}

// =============================================================================
// TOML, as Forge and night-config write it
// =============================================================================

fn parse_toml(text: &str, doc: &mut Document) {
    let lines = line_spans(text);
    let mut table: Vec<String> = Vec::new();
    // Inside `[[an array of tables]]`: several tables share one path, so its
    // keys are not addressable and are left alone.
    let mut in_array_table = false;
    let mut comment: Vec<String> = Vec::new();
    let mut i = 0;
    while i < lines.len() {
        let (s, e) = lines[i];
        i += 1;
        let line = &text[s..e];
        let indent = lead(line);
        let t = line[indent..].trim_end();
        if t.is_empty() {
            comment.clear();
            continue;
        }
        if let Some(rest) = t.strip_prefix('#') {
            comment.push(rest.trim().to_string());
            continue;
        }
        if t.starts_with('[') {
            let double = t.starts_with("[[");
            let open = if double { 2 } else { 1 };
            match find_unquoted(&t[open..], b']') {
                Some(close) => {
                    table = split_key(&t[open..open + close]);
                    in_array_table = double;
                    if !double {
                        doc.sections.push((table.join("."), comment.join("\n")));
                    }
                }
                None => doc.problem(format!("line {i}: a table header without its `]`")),
            }
            comment.clear();
            continue;
        }
        let Some(eq) = find_unquoted(t, b'=') else {
            doc.problem(format!("line {i}: neither a key nor a table"));
            comment.clear();
            continue;
        };
        let name = split_key(&t[..eq]).join(".");
        let after = &t[eq + 1..];
        let value = after.trim_start();
        let vstart = s + indent + eq + 1 + (after.len() - value.len());
        let line_end = s + indent + t.len();
        let (end, kind, quoted) = if value.is_empty() {
            (vstart, Kind::Other, false)
        } else if value.starts_with("\"\"\"") || value.starts_with("'''") {
            let delim = &value[..3];
            let end = text[vstart + 3..].find(delim).map_or(text.len(), |p| vstart + 3 + p + 3);
            (end, Kind::Other, false)
        } else if value.starts_with('"') {
            let b = value.as_bytes();
            let mut j = 1;
            while j < b.len() && b[j] != b'"' {
                if b[j] == b'\\' {
                    j += 1;
                }
                j += 1;
            }
            if j < b.len() {
                (vstart + j + 1, Kind::Text, true)
            } else {
                (line_end, Kind::Other, false)
            }
        } else if value.starts_with('\'') {
            match value[1..].find('\'') {
                Some(p) => (vstart + p + 2, Kind::Text, true),
                None => (line_end, Kind::Other, false),
            }
        } else if value.starts_with('[') {
            (balanced_end(text, vstart, b'[', b']', true), Kind::List, false)
        } else if value.starts_with('{') {
            (balanced_end(text, vstart, b'{', b'}', true), Kind::Other, false)
        } else {
            let n = value.find(|c: char| c == '#' || c.is_whitespace()).unwrap_or(value.len());
            (vstart + n, scalar_kind(&value[..n]), false)
        };
        // A value that runs past this line: skip the lines it covers.
        while i < lines.len() && lines[i].0 < end {
            i += 1;
        }
        if !in_array_table {
            doc.push(&table.join("."), name, &text[vstart..end], kind, quoted, (vstart, end), &comment);
        }
        comment.clear();
    }
}

// =============================================================================
// The legacy Forge .cfg format
// =============================================================================

fn parse_cfg(text: &str, doc: &mut Document) {
    let lines = line_spans(text);
    let mut cats: Vec<String> = Vec::new();
    let mut comment: Vec<String> = Vec::new();
    let mut i = 0;
    while i < lines.len() {
        let (s, e) = lines[i];
        i += 1;
        let line = &text[s..e];
        let indent = lead(line);
        let t = line[indent..].trim_end();
        if t.is_empty() {
            comment.clear();
            continue;
        }
        if t.starts_with('#') {
            // `####` and `#----#` rules carry nothing.
            let body = t.trim_start_matches('#').trim();
            if !body.is_empty() && !body.chars().all(|c| c == '-' || c == '#' || c == '=') {
                comment.push(body.to_string());
            }
            continue;
        }
        if t.starts_with('~') {
            comment.clear();
            continue;
        }
        if t == "}" {
            cats.pop();
            comment.clear();
            continue;
        }
        if let Some(name) = t.strip_suffix('{') {
            cats.push(name.trim().trim_matches('"').to_string());
            doc.sections.push((cats.join("."), comment.join("\n")));
            comment.clear();
            continue;
        }
        let b = t.as_bytes();
        if b.len() >= 3 && b[1] == b':' && b[0].is_ascii_uppercase() {
            let ty = b[0];
            let rest = &t[2..];
            let section = cats.join(".");
            match rest.find('=') {
                Some(eq) => {
                    let name = rest[..eq].trim().trim_matches('"').to_string();
                    let start = s + indent + 2 + eq + 1;
                    let end = s + indent + t.len();
                    let raw = &text[start..end];
                    let meta = parse_meta(&comment);
                    let kind = match ty {
                        b'B' => Kind::Bool,
                        b'I' => Kind::Int,
                        b'D' => Kind::Float,
                        // Decimals are written as strings with a range in the comment.
                        _ if (meta.min.is_some() || meta.max.is_some()) && raw.trim().parse::<f64>().is_ok() => Kind::Float,
                        _ => Kind::Text,
                    };
                    doc.push(&section, name, raw, kind, false, (start, end), &comment);
                }
                None if rest.ends_with('<') => {
                    let name = rest.trim_end_matches('<').trim().trim_matches('"').to_string();
                    let mut items: Vec<String> = Vec::new();
                    let mut end = s + indent + t.len();
                    while i < lines.len() {
                        let (ls, le) = lines[i];
                        i += 1;
                        end = le;
                        let item = text[ls..le].trim();
                        if item == ">" {
                            break;
                        }
                        if !item.is_empty() {
                            items.push(item.to_string());
                        }
                    }
                    doc.push(&section, name, &items.join(", "), Kind::List, false, (s + indent, end), &comment);
                }
                None => doc.problem(format!("line {i}: a key without a value")),
            }
            comment.clear();
            continue;
        }
        doc.problem(format!("line {i}: not understood"));
        comment.clear();
    }
}

// =============================================================================
// JSON (JSON5 comments, bare keys and trailing commas tolerated)
// =============================================================================

struct JsonScan<'a> {
    text: &'a str,
    b: &'a [u8],
    i: usize,
    /// Descend into arrays (`name[0]`, `name[1]`, ...) instead of recording
    /// each as one list.
    deep: bool,
}

impl<'a> JsonScan<'a> {
    fn ws(&mut self) {
        loop {
            while self.i < self.b.len() && self.b[self.i].is_ascii_whitespace() {
                self.i += 1;
            }
            if self.b[self.i..].starts_with(b"//") {
                while self.i < self.b.len() && self.b[self.i] != b'\n' {
                    self.i += 1;
                }
            } else if self.b[self.i..].starts_with(b"/*") {
                self.i = self.text[self.i + 2..].find("*/").map_or(self.b.len(), |p| self.i + 2 + p + 2);
            } else {
                return;
            }
        }
    }

    /// A key or a string value; leaves the cursor after it.
    fn string(&mut self) -> Result<String, String> {
        let start = self.i;
        match self.b.get(self.i).copied() {
            Some(q) if q == b'"' || q == b'\'' => {
                self.i += 1;
                while self.i < self.b.len() && self.b[self.i] != q {
                    if self.b[self.i] == b'\\' {
                        self.i += 1;
                    }
                    self.i += 1;
                }
                if self.i >= self.b.len() {
                    self.i = self.b.len();
                    return Err("a string that never ends".to_string());
                }
                self.i += 1;
                Ok(unquote(&self.text[start..self.i]))
            }
            Some(c) if c.is_ascii_alphabetic() || c == b'_' || c == b'$' => {
                while self.i < self.b.len() && (self.b[self.i].is_ascii_alphanumeric() || self.b[self.i] == b'_' || self.b[self.i] == b'$') {
                    self.i += 1;
                }
                Ok(self.text[start..self.i].to_string())
            }
            _ => Err(format!("a key was expected at byte {start}")),
        }
    }

    fn value(&mut self, path: &mut Vec<String>, doc: &mut Document, depth: usize) -> Result<(), String> {
        if depth > 64 {
            return Err("nested too deeply".to_string());
        }
        self.ws();
        let start = self.i;
        match self.b.get(self.i).copied() {
            None => Err("the file ends in the middle of a value".to_string()),
            Some(b'{') => {
                self.i += 1;
                loop {
                    self.ws();
                    if self.b.get(self.i).copied() == Some(b'}') {
                        self.i += 1;
                        return Ok(());
                    }
                    let key = self.string()?;
                    self.ws();
                    if self.b.get(self.i).copied() != Some(b':') {
                        return Err(format!("a `:` was expected after \"{key}\""));
                    }
                    self.i += 1;
                    path.push(key);
                    let inner = self.value(path, doc, depth + 1);
                    path.pop();
                    inner?;
                    self.ws();
                    match self.b.get(self.i).copied() {
                        Some(b',') => self.i += 1,
                        Some(b'}') => {
                            self.i += 1;
                            return Ok(());
                        }
                        _ => return Err(format!("a `,` or `}}` was expected at byte {}", self.i)),
                    }
                }
            }
            Some(b'[') if self.deep => {
                self.i += 1;
                // The element's path is the array's own name with its position:
                // the caller pushed `placement`; each element is `placement[n]`.
                let base = path.pop();
                let mut index = 0usize;
                let walked = loop {
                    self.ws();
                    if self.b.get(self.i).copied() == Some(b']') {
                        self.i += 1;
                        break Ok(());
                    }
                    path.push(format!("{}[{index}]", base.as_deref().unwrap_or("")));
                    let inner = self.value(path, doc, depth + 1);
                    path.pop();
                    if let Err(why) = inner {
                        break Err(why);
                    }
                    index += 1;
                    self.ws();
                    match self.b.get(self.i).copied() {
                        Some(b',') => self.i += 1,
                        Some(b']') => {
                            self.i += 1;
                            break Ok(());
                        }
                        _ => break Err(format!("a `,` or `]` was expected at byte {}", self.i)),
                    }
                };
                if let Some(base) = base {
                    path.push(base);
                }
                walked
            }
            Some(b'[') => {
                self.i = balanced_end(self.text, start, b'[', b']', false);
                self.record(path, doc, start, Kind::List, false);
                Ok(())
            }
            Some(b'"') | Some(b'\'') => {
                self.string()?;
                self.record(path, doc, start, Kind::Text, true);
                Ok(())
            }
            Some(_) => {
                while self.i < self.b.len() && !matches!(self.b[self.i], b',' | b'}' | b']') && !self.b[self.i].is_ascii_whitespace() {
                    self.i += 1;
                }
                if self.i == start {
                    return Err(format!("an unexpected character at byte {start}"));
                }
                let kind = scalar_kind(&self.text[start..self.i]);
                self.record(path, doc, start, kind, false);
                Ok(())
            }
        }
    }

    fn record(&self, path: &[String], doc: &mut Document, start: usize, kind: Kind, quoted: bool) {
        let Some((name, parents)) = path.split_last() else { return };
        doc.push(&parents.join("."), name.clone(), &self.text[start..self.i], kind, quoted, (start, self.i), &[]);
    }
}

fn parse_json(text: &str, doc: &mut Document) {
    let mut scan = JsonScan { text, b: text.as_bytes(), i: if text.starts_with('\u{feff}') { 3 } else { 0 }, deep: doc.deep };
    let mut path = Vec::new();
    if let Err(why) = scan.value(&mut path, doc, 0) {
        doc.problem(why);
    }
    // JSON has no comments. What an object says it is (`"type": "..."`) is the
    // nearest thing to a description of the values beside it.
    let kinds: std::collections::BTreeMap<String, String> =
        doc.entries.iter().filter(|e| e.name == "type" && e.kind == Kind::Text).map(|e| (e.section.clone(), e.value())).collect();
    let mut seen = std::collections::BTreeSet::new();
    for e in &doc.entries {
        if !e.section.is_empty() && seen.insert(e.section.clone()) {
            doc.sections.push((e.section.clone(), kinds.get(&e.section).cloned().unwrap_or_default()));
        }
    }
}

// =============================================================================
// .properties
// =============================================================================

fn parse_properties(text: &str, doc: &mut Document) {
    for (s, e) in line_spans(text) {
        let line = &text[s..e];
        let indent = lead(line);
        let t = line[indent..].trim_end();
        if t.is_empty() || t.starts_with('#') || t.starts_with('!') {
            continue;
        }
        let Some(sep) = t.find(|c: char| c == '=' || c == ':') else { continue };
        let name = t[..sep].trim().to_string();
        let after = &t[sep + 1..];
        let start = s + indent + sep + 1 + (after.len() - after.trim_start().len());
        let end = s + indent + t.len();
        let raw = &text[start..end];
        let kind = if raw == "true" || raw == "false" {
            Kind::Bool
        } else if raw.parse::<i64>().is_ok() {
            Kind::Int
        } else {
            Kind::Text
        };
        doc.push("", name, raw, kind, false, (start, end), &[]);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const TOML: &str = "\n#World generation settings\n[world_generation]\n\t#Allows chunks to retrogen.\n\tenableRegeneration = false\n\t#Change this value to regen.\n\t#Range: > 0\n\tuserWorldGenVersion = 0\n\n\t#Generation Settings for tin ore.\n\t[world_generation.tin]\n\t\tshouldGenerate = true\n\n\t\t[world_generation.tin.small]\n\t\t\t#Chance that small tin veins generates in a chunk.\n\t\t\t#Range: 1 ~ 256\n\t\t\tperChunk = 12\n\t\t\t#Range: 0.0 ~ 1.0\n\t\t\tdiscardChanceOnAirExposure = 0.0\n\t\t\t#Allowed Values: TRAPEZOID, UNIFORM\n\t\t\tshape = \"TRAPEZOID\"\n\n[World.Features.\"Oil Sand\"]\n\tEnable = true\n\"Aether Region Size\" = 3\nlist = [\"a\", \"b\"]\nmulti = [\n  \"x\", # with ] in a comment\n  \"y\"\n]\nafter = 1 # trailing\ngeneral = {}\n\n[generation_settings]\n\t#Range: 2-6\n\toverworld_region_size = 3\n\t#Range: 0-2147483647\n\t# stock=9. 9 -> 16.\n\tvanilla_overworld_region_weight = 16\n";

    fn toml() -> Document {
        Document::parse(Format::Toml, TOML)
    }

    #[test]
    fn toml_keys_kinds_and_what_the_comments_say() {
        let doc = toml();
        assert!(doc.problems.is_empty(), "{:?}", doc.problems);
        let keys: Vec<&str> = doc.entries.iter().map(|e| e.key.as_str()).collect();
        assert_eq!(
            keys,
            [
                "world_generation.enableRegeneration",
                "world_generation.userWorldGenVersion",
                "world_generation.tin.shouldGenerate",
                "world_generation.tin.small.perChunk",
                "world_generation.tin.small.discardChanceOnAirExposure",
                "world_generation.tin.small.shape",
                "World.Features.Oil Sand.Enable",
                "World.Features.Oil Sand.Aether Region Size",
                "World.Features.Oil Sand.list",
                "World.Features.Oil Sand.multi",
                "World.Features.Oil Sand.after",
                "World.Features.Oil Sand.general",
                "generation_settings.overworld_region_size",
                "generation_settings.vanilla_overworld_region_weight",
            ]
        );
        let get = |k: &str| doc.get(k).unwrap();
        assert_eq!(get("world_generation.enableRegeneration").kind, Kind::Bool);
        assert_eq!(get("world_generation.enableRegeneration").comment, "Allows chunks to retrogen.");

        let version = get("world_generation.userWorldGenVersion");
        assert_eq!((version.kind, version.min, version.max), (Kind::Int, Some(0.0), None));
        assert_eq!(version.range_text(), "at least 0");

        let per_chunk = get("world_generation.tin.small.perChunk");
        assert_eq!((per_chunk.raw.as_str(), per_chunk.min, per_chunk.max), ("12", Some(1.0), Some(256.0)));
        assert_eq!(per_chunk.section, "world_generation.tin.small");
        assert_eq!(per_chunk.name, "perChunk");
        assert_eq!(per_chunk.range_text(), "1 to 256");

        let discard = get("world_generation.tin.small.discardChanceOnAirExposure");
        assert_eq!((discard.kind, discard.max), (Kind::Float, Some(1.0)));

        let shape = get("world_generation.tin.small.shape");
        assert_eq!((shape.kind, shape.raw.as_str(), shape.value().as_str()), (Kind::Text, "\"TRAPEZOID\"", "TRAPEZOID"));
        assert_eq!(shape.allowed, ["TRAPEZOID", "UNIFORM"]);

        assert_eq!(get("World.Features.Oil Sand.list").kind, Kind::List);
        let multi = get("World.Features.Oil Sand.multi");
        assert_eq!(multi.kind, Kind::List);
        assert!(multi.raw.starts_with('[') && multi.raw.ends_with(']') && multi.raw.contains("\"y\""), "{}", multi.raw);
        assert_eq!(get("World.Features.Oil Sand.after").raw, "1");
        assert_eq!(get("World.Features.Oil Sand.general").kind, Kind::Other);

        // TerraBlender writes ranges as `2-6`; a hand-written note below the
        // range line does not unset it.
        let size = get("generation_settings.overworld_region_size");
        assert_eq!((size.min, size.max), (Some(2.0), Some(6.0)));
        let weight = get("generation_settings.vanilla_overworld_region_weight");
        assert_eq!((weight.min, weight.max), (Some(0.0), Some(2147483647.0)));

        assert!(doc.sections.iter().any(|(path, comment)| path == "world_generation.tin" && comment == "Generation Settings for tin ore."));
    }

    #[test]
    fn toml_set_changes_that_value_and_no_other_byte() {
        for text in [TOML.to_string(), TOML.replace('\n', "\r\n")] {
            let mut doc = Document::parse(Format::Toml, &text);
            assert_eq!(doc.set("world_generation.tin.small.perChunk", "40"), Ok(true));
            assert_eq!(doc.set("world_generation.tin.small.perChunk", "40"), Ok(false));
            assert_eq!(doc.set("world_generation.tin.small.shape", "\"UNIFORM\""), Ok(true));
            assert_eq!(doc.set("World.Features.Oil Sand.after", "2"), Ok(true));
            assert_eq!(doc.set("world_generation.enableRegeneration", "true"), Ok(true));
            let expected = text
                .replace("perChunk = 12", "perChunk = 40")
                .replace("shape = \"TRAPEZOID\"", "shape = \"UNIFORM\"")
                .replace("after = 1 # trailing", "after = 2 # trailing")
                .replace("enableRegeneration = false", "enableRegeneration = true");
            assert_eq!(doc.text(), expected);
            // The comments still say the same about the edited keys.
            assert_eq!(doc.get("world_generation.tin.small.perChunk").unwrap().max, Some(256.0));
        }
    }

    #[test]
    fn set_refuses_what_it_cannot_do_safely() {
        let mut doc = toml();
        let before = doc.text().to_string();
        assert!(doc.set("world_generation.nope", "1").is_err());
        assert!(doc.set("World.Features.Oil Sand.list", "[]").is_err());
        assert!(doc.set("world_generation.tin.small.perChunk", "1\n2").is_err());
        // A value that would swallow the rest of the line or open a string
        // changes how other keys read: refused.
        assert!(doc.set("world_generation.tin.small.perChunk", "\"").is_err());
        assert!(doc.set("world_generation.tin.small.perChunk", "[").is_err());
        assert_eq!(doc.text(), before);
    }

    #[test]
    fn encode_checks_kind_range_and_allowed_values() {
        let doc = toml();
        let per_chunk = doc.get("world_generation.tin.small.perChunk").unwrap();
        assert_eq!(per_chunk.encode(" 40 "), Ok("40".to_string()));
        assert!(per_chunk.encode("300").unwrap_err().contains("more than 256"));
        assert!(per_chunk.encode("0").unwrap_err().contains("less than 1"));
        assert!(per_chunk.encode("4.5").is_err());
        assert!(per_chunk.encode("many").is_err());

        let discard = doc.get("world_generation.tin.small.discardChanceOnAirExposure").unwrap();
        assert_eq!(discard.encode("1"), Ok("1.0".to_string()));
        assert_eq!(discard.encode("0.25"), Ok("0.25".to_string()));
        assert!(discard.encode("1.5").is_err());
        assert!(discard.encode("inf").is_err());

        let shape = doc.get("world_generation.tin.small.shape").unwrap();
        assert_eq!(shape.encode("UNIFORM"), Ok("\"UNIFORM\"".to_string()));
        assert!(shape.encode("ROUND").is_err());

        let flag = doc.get("world_generation.enableRegeneration").unwrap();
        assert_eq!(flag.encode("TRUE"), Ok("true".to_string()));
        assert_eq!(flag.encode("off"), Ok("false".to_string()));
        assert!(flag.encode("1").is_err());

        assert!(doc.get("World.Features.Oil Sand.list").unwrap().encode("x").is_err());
    }

    const CFG: &str = "# Configuration file\n\nConfig {\n    # If set to False, parameters from this config will not be used. [default: true]\n    B:enabled=true\n}\n\n\nDeposit {\n    # List of ores.\n    S:ores <\n        #forge:ores/osmium\n     >\n\n    # Rarity (in chunks).\n    #  [range: 0 ~ 256000, default: 0]\n    I:rarity=1829\n\n    ##########\n    # Altitude\n    #--------#\n    ##########\n\n    Altitude {\n        #  [range: -2147483648 ~ 2147483647, default: 0]\n        I:max=32\n\n        #  [range: -2147483648 ~ 2147483647, default: 0]\n        I:min=8\n    }\n\n    Indicator {\n        # Percentage of the indicator shape that will be visible. [range: 0.0 ~ 100.0, default: 60.0]\n        S:continuity=60.0\n\n        # ID of a block. [default: ]\n        S:id=\n    }\n\n}\n";

    #[test]
    fn cfg_categories_typed_keys_lists_and_ranges() {
        let doc = Document::parse(Format::Cfg, CFG);
        assert!(doc.problems.is_empty(), "{:?}", doc.problems);
        let keys: Vec<&str> = doc.entries.iter().map(|e| e.key.as_str()).collect();
        assert_eq!(
            keys,
            ["Config.enabled", "Deposit.ores", "Deposit.rarity", "Deposit.Altitude.max", "Deposit.Altitude.min", "Deposit.Indicator.continuity", "Deposit.Indicator.id"]
        );
        let get = |k: &str| doc.get(k).unwrap();
        assert_eq!((get("Config.enabled").kind, get("Config.enabled").default.as_deref()), (Kind::Bool, Some("true")));
        // A list item may start with `#` (a tag): it is not a comment.
        assert_eq!((get("Deposit.ores").kind, get("Deposit.ores").raw.as_str()), (Kind::List, "#forge:ores/osmium"));
        let rarity = get("Deposit.rarity");
        assert_eq!((rarity.kind, rarity.raw.as_str(), rarity.min, rarity.max, rarity.default.as_deref()), (Kind::Int, "1829", Some(0.0), Some(256000.0), Some("0")));
        assert_eq!(get("Deposit.Altitude.max").min, Some(-2147483648.0));
        // A decimal is written as S: with a range: it is a number here.
        let continuity = get("Deposit.Indicator.continuity");
        assert_eq!((continuity.kind, continuity.max), (Kind::Float, Some(100.0)));
        assert_eq!(continuity.encode("75"), Ok("75.0".to_string()));
        let id = get("Deposit.Indicator.id");
        assert_eq!((id.kind, id.raw.as_str(), id.default.as_deref()), (Kind::Text, "", None));
        assert!(rarity.encode("300000").is_err());
    }

    #[test]
    fn cfg_set_changes_that_value_and_no_other_byte() {
        for text in [CFG.to_string(), CFG.replace('\n', "\r\n")] {
            let mut doc = Document::parse(Format::Cfg, &text);
            assert_eq!(doc.set("Deposit.rarity", "1500"), Ok(true));
            assert_eq!(doc.set("Deposit.Altitude.min", "-16"), Ok(true));
            assert_eq!(doc.set("Deposit.Indicator.id", "minecraft:stone"), Ok(true));
            assert_eq!(doc.set("Config.enabled", "false"), Ok(true));
            let expected = text
                .replace("I:rarity=1829", "I:rarity=1500")
                .replace("I:min=8", "I:min=-16")
                .replace("S:id=", "S:id=minecraft:stone")
                .replace("B:enabled=true", "B:enabled=false");
            assert_eq!(doc.text(), expected);
        }
    }

    const JSON: &str = "{\n  \"biomes\": {\n    \"temperature_scale\": 0.25,\n    \"on\": true\n  },\n  \"name\": \"a \\\"b\\\"\",\n  \"list\": [1, 2, {\"x\": \"]\"}],\n  \"nothing\": null,\n  \"minor_version\": 3\n}\n";

    #[test]
    fn json_paths_kinds_and_in_place_edits() {
        let mut doc = Document::parse(Format::Json, JSON);
        assert!(doc.problems.is_empty(), "{:?}", doc.problems);
        let keys: Vec<&str> = doc.entries.iter().map(|e| e.key.as_str()).collect();
        assert_eq!(keys, ["biomes.temperature_scale", "biomes.on", "name", "list", "nothing", "minor_version"]);
        assert_eq!(doc.get("biomes.temperature_scale").unwrap().kind, Kind::Float);
        assert_eq!(doc.get("biomes.on").unwrap().kind, Kind::Bool);
        assert_eq!(doc.get("name").unwrap().value(), "a \"b\"");
        assert_eq!((doc.get("list").unwrap().kind, doc.get("list").unwrap().raw.as_str()), (Kind::List, "[1, 2, {\"x\": \"]\"}]"));
        assert_eq!(doc.get("nothing").unwrap().kind, Kind::Other);
        assert_eq!(doc.get("minor_version").unwrap().kind, Kind::Int);

        assert_eq!(doc.set("biomes.temperature_scale", "0.3"), Ok(true));
        assert_eq!(doc.set("biomes.on", "false"), Ok(true));
        let renamed = doc.get("name").unwrap().encode("c\\d").unwrap();
        assert_eq!(doc.set("name", &renamed), Ok(true));
        assert_eq!(
            doc.text(),
            JSON.replace("0.25", "0.3").replace("\"on\": true", "\"on\": false").replace("\"a \\\"b\\\"\"", "\"c\\\\d\"")
        );
        assert_eq!(doc.get("name").unwrap().value(), "c\\d");
    }

    /// A placed feature as the pack's datapack writes it (CRLF and all).
    const PLACED: &str = "{\r\n  \"feature\": \"minecraft:ore_iron\",\r\n  \"placement\": [\r\n    {\r\n      \"type\": \"minecraft:count\",\r\n      \"count\": 113\r\n    },\r\n    {\r\n      \"type\": \"minecraft:in_square\"\r\n    },\r\n    {\r\n      \"type\": \"minecraft:height_range\",\r\n      \"height\": {\r\n        \"type\": \"minecraft:trapezoid\",\r\n        \"max_inclusive\": {\r\n          \"absolute\": 384\r\n        },\r\n        \"min_inclusive\": {\r\n          \"absolute\": 80\r\n        }\r\n      }\r\n    },\r\n    {\r\n      \"type\": \"minecraft:biome\"\r\n    }\r\n  ],\r\n  \"tags\": [\"a\", 2, [true]]\r\n}";

    #[test]
    fn json_deep_reaches_the_values_inside_arrays() {
        // Read the ordinary way, the list of placement steps is one opaque value.
        let flat = Document::parse(Format::Json, PLACED);
        assert_eq!(flat.entries.iter().map(|e| e.key.as_str()).collect::<Vec<_>>(), ["feature", "placement", "tags"]);
        assert_eq!(flat.get("placement").unwrap().kind, Kind::List);

        let mut doc = Document::parse_json_deep(PLACED);
        assert!(doc.problems.is_empty(), "{:?}", doc.problems);
        let keys: Vec<&str> = doc.entries.iter().map(|e| e.key.as_str()).collect();
        assert_eq!(
            keys,
            [
                "feature",
                "placement[0].type",
                "placement[0].count",
                "placement[1].type",
                "placement[2].type",
                "placement[2].height.type",
                "placement[2].height.max_inclusive.absolute",
                "placement[2].height.min_inclusive.absolute",
                "placement[3].type",
                "tags[0]",
                "tags[1]",
                "tags[2][0]",
            ]
        );
        let count = doc.get("placement[0].count").unwrap();
        assert_eq!((count.kind, count.raw.as_str(), count.section.as_str(), count.name.as_str()), (Kind::Int, "113", "placement[0]", "count"));
        assert_eq!(doc.get("tags[1]").unwrap().section, "");
        assert_eq!(doc.get("tags[2][0]").unwrap().kind, Kind::Bool);
        // A position says nothing; what the step calls itself does.
        let about = |section: &str| doc.sections.iter().find(|(path, _)| path == section).map(|(_, text)| text.as_str());
        assert_eq!(about("placement[0]"), Some("minecraft:count"));
        assert_eq!(about("placement[2].height"), Some("minecraft:trapezoid"));
        assert_eq!(about("placement[2].height.max_inclusive"), Some(""));

        // Edits are in place here too, and stay deep when re-read.
        assert_eq!(doc.set("placement[0].count", "90"), Ok(true));
        assert_eq!(doc.set("placement[2].height.min_inclusive.absolute", "-24"), Ok(true));
        assert_eq!(doc.text(), PLACED.replace("\"count\": 113", "\"count\": 90").replace("\"absolute\": 80", "\"absolute\": -24"));
        assert_eq!(doc.get("placement[0].count").unwrap().raw, "90");
        // A number cannot become a string, nor swallow the rest of the array.
        assert!(doc.set("placement[0].count", "\"many\"").is_err());
        assert!(doc.set("placement[0].count", "1 }, {").is_err());

        // A damaged list: what was read stays, and the problem is reported.
        let broken = Document::parse_json_deep("{ \"a\": [1, 2 3] }");
        assert_eq!(broken.entries.len(), 2);
        assert_eq!(broken.problems.len(), 1);
        // A list at the top of a file.
        let top = Document::parse_json_deep("[ {\"x\": 1}, 5 ]");
        assert_eq!(top.entries.iter().map(|e| e.key.as_str()).collect::<Vec<_>>(), ["[0].x", "[1]"]);
    }

    #[test]
    fn json5_comments_bare_keys_and_trailing_commas() {
        let doc = Document::parse(Format::Json, "\u{feff}{\n  // why this is on\n  breaks_seed_parity: true, /* inline */\n  'other': 2,\n}\n");
        assert!(doc.problems.is_empty(), "{:?}", doc.problems);
        assert_eq!(doc.get("breaks_seed_parity").unwrap().kind, Kind::Bool);
        assert_eq!(doc.get("other").unwrap().raw, "2");
        // A damaged file: what was read stays, and the problem is reported.
        let broken = Document::parse(Format::Json, "{ \"a\": 1, \"b\" 2 }");
        assert_eq!(broken.entries.len(), 1);
        assert_eq!(broken.problems.len(), 1);
    }

    #[test]
    fn properties_keys_and_edits() {
        let text = "#Minecraft server properties\n#Sun Oct 11 10:00:00 PDT 2026\nlevel-name=world\nmax-tick-time=60000\nmotd=A Minecraft Server\nlevel-type=minecraft\\:normal\nwhite-list=true\nlevel-seed=\n";
        let mut doc = Document::parse(Format::Properties, text);
        let kinds: Vec<(&str, Kind)> = doc.entries.iter().map(|e| (e.key.as_str(), e.kind)).collect();
        assert_eq!(
            kinds,
            [
                ("level-name", Kind::Text),
                ("max-tick-time", Kind::Int),
                ("motd", Kind::Text),
                ("level-type", Kind::Text),
                ("white-list", Kind::Bool),
                ("level-seed", Kind::Text)
            ]
        );
        assert_eq!(doc.get("level-type").unwrap().raw, "minecraft\\:normal");
        assert_eq!(doc.set("max-tick-time", "-1"), Ok(true));
        assert_eq!(doc.set("level-seed", "12345"), Ok(true));
        assert_eq!(doc.text(), text.replace("max-tick-time=60000", "max-tick-time=-1").replace("level-seed=", "level-seed=12345"));
    }

    #[test]
    fn ranges_as_the_mods_write_them() {
        assert_eq!(parse_range(" 1 ~ 256"), (Some(1.0), Some(256.0)));
        assert_eq!(parse_range("0.0 ~ 10.0"), (Some(0.0), Some(10.0)));
        assert_eq!(parse_range("> 0"), (Some(0.0), None));
        assert_eq!(parse_range("< 5"), (None, Some(5.0)));
        assert_eq!(parse_range("2-6"), (Some(2.0), Some(6.0)));
        assert_eq!(parse_range("-5-10"), (Some(-5.0), Some(10.0)));
        assert_eq!(parse_range("-2147483648 ~ 2147483647"), (Some(-2147483648.0), Some(2147483647.0)));
        assert_eq!(parse_range("a to b"), (None, None));
        // Prose that happens to hold the word is not a range.
        let meta = parse_meta(&["Vein Finder 'Found Nearby' range in chunks".to_string()]);
        assert_eq!((meta.min, meta.max), (None, None));
    }

    #[test]
    fn same_value_compares_numbers_as_numbers() {
        assert!(same_value("1.0", "1"));
        assert!(same_value(" 40 ", "40"));
        assert!(same_value("\"A\"", "\"A\""));
        assert!(!same_value("\"A\"", "\"B\""));
        assert!(!same_value("true", "false"));
        assert_eq!(fmt_float(40.0), "40.0");
        assert_eq!(fmt_float(0.38), "0.38");
        assert_eq!(fmt_float(-0.075), "-0.075");
    }

    #[test]
    fn formats_by_file_name() {
        assert_eq!(Format::of_path("config/Mekanism/world.toml"), Some(Format::Toml));
        assert_eq!(Format::of_path("config/adlods/Deposits/osmium.CFG"), Some(Format::Cfg));
        assert_eq!(Format::of_path("config/tectonic.json"), Some(Format::Json));
        assert_eq!(Format::of_path("server.properties"), Some(Format::Properties));
        assert_eq!(Format::of_path("world/region/r.0.0.mca"), None);
    }
}
