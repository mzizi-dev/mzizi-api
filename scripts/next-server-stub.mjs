// Stand-in for `next/server` while extracting registry data.
//
// scripts/extract.ts imports a few of mzizi-registry's route handlers and runs
// them, to check at build time that this Worker answers exactly as they do. The
// handlers use only `NextResponse.json(body, init)`, which is
// `JSON.stringify(body)` with `content-type: application/json` and `init`'s
// status and headers: the standard `Response.json`. Next itself is not
// installed, so this is all of it that the build needs. Anything else a handler
// reaches for is undefined here and fails the build.
export class NextResponse extends Response {
  static json(body, init) {
    return Response.json(body, init);
  }
}
