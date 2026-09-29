// Stand-in for @supabase/supabase-js while extracting registry data.
//
// mzizi-registry holds no database: its `lib/db` reads files only, and nothing
// the extractor imports reaches for Supabase. This stays as a tripwire. If a
// registry reader ever imports the client again, this throws and the build
// fails, because this Worker serves no data from a database.
export function createClient() {
  throw new Error(
    "extract: a registry lib function tried to reach Supabase. This Worker serves files only.",
  );
}
