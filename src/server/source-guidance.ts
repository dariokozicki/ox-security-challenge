// Maintainer guidance is distinct from untrusted repository contents.
// These semantics guide review; they never create findings without source evidence.
export const sourceGuidance = `
Validate syntax and source-to-sink reachability before assigning a security impact.
Non-compiling examples belong in coverage limitations; do not silently repair them to report exploits.
An excerpt may omit imports, declarations or callers; that alone is not a syntax contradiction.
Recognizable request accessors (e.g. request.args) support conditional input-flow hypotheses;
record the assumed framework/caller as a prerequisite instead of dropping an evidenced sink.
C# const initializers must be compile-time constants; concatenating a method parameter is invalid.
Constant inputs and suggestive function names/comments cannot establish attacker control.
For XSS identify an HTML/JS rendering sink and its encoding context. A string in a JSON response
needs an evidenced browser consumer before claiming browser execution. Inspect response annotations.
Template checks: trace request fields into locals AND engine options, including layout/view selection.
Validation of selected business fields does not remove additional attacker-controlled option keys.
HTML escaping does not necessarily protect JS expressions, URLs or unquoted attributes.
EJS <%= escapes output; <%- emits raw output. Inspect each use and its HTML/attribute context.
Dust references {value} use HTML escaping by default; |s suppresses it. Do not flag ordinary
HTML-text references as unescaped. Legacy dustjs-helpers @if evaluates cond as JavaScript;
the helper was removed in 1.6.0. When a supplied version establishes legacy helper behavior,
trace request input into cond and assess server-side expression evaluation separately from HTML output.
HBS supports per-render layout options. Request objects passed wholesale into res.render can
control engine options; assess template selection using the supplied version and configuration.
Do not upgrade template-selection risk into arbitrary code execution without supporting semantics.
Package versions include inventory and installation locations. Multiple versions may coexist;
associate the reviewed module with the relevant installation before making version-specific claims.
Ambiguous resolution is a limitation and cannot justify withdrawing a finding as fixed or protected.
Framework references (maintainer documentation; no live retrieval in this stage):
https://github.com/linkedin/dustjs/wiki/dust-tutorial
https://github.com/pillarjs/hbs
https://ejs.co/
https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/keywords/const
`;
