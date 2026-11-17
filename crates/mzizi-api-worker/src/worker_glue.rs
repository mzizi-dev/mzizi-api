//! The Workers entry point: reads the method, URL and clock, runs the router,
//! and turns its [`Reply`] into a `Response`.

use worker::{Context, Env, Headers, Request, Response, ResponseBuilder, Result, event, js_sys};

use crate::{Clock, Reply, handle};

fn clock() -> Clock {
    let now = js_sys::Date::new_0();
    let expires = js_sys::Date::new_0();
    expires.set_full_year(expires.get_full_year() + 1);
    Clock {
        now_iso: String::from(now.to_iso_string()),
        expires_iso: String::from(expires.to_iso_string()),
    }
}

fn into_response(reply: Reply) -> Result<Response> {
    let headers = Headers::new();
    for (name, value) in reply.headers.iter() {
        headers.set(name, value)?;
    }
    let builder = ResponseBuilder::new()
        .with_status(reply.status)
        .with_headers(headers);
    Ok(match reply.body {
        Some(body) => builder.fixed(body),
        None => builder.empty(),
    })
}

#[event(fetch)]
async fn fetch(req: Request, _env: Env, _ctx: Context) -> Result<Response> {
    let url = req.inner().url();
    let method = req.inner().method();
    into_response(handle(&method, &url, &clock()))
}
