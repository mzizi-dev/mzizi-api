// Stand-in for @supabase/supabase-js while extracting registry data.
//
// The extractor imports mzizi-registry's `lib/db`, which constructs Supabase
// clients lazily. Nothing the extractor calls reaches them — every function it
// uses reads files. If one ever does, this throws and the build fails, which is
// the point: this Worker serves no data from Supabase.
export function createClient() {
  throw new Error(
    "extract: a registry lib function tried to reach Supabase. This Worker serves files only.",
  );
}
