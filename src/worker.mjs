import { DurableObject } from "cloudflare:workers";
import { PressService } from "./service.mjs";
export class Press extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.service = new PressService(ctx.storage, env);
  }
  fetch(req) {
    return this.service.handle(req);
  }
  tick(now) {
    return this.service.serial(() => this.service.tick(new Date(now)));
  }
}
export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    let response;
    if (url.pathname.startsWith("/api/"))
      response = await env.PRESS.get(env.PRESS.idFromName("owner")).fetch(req);
    else response = await env.ASSETS.fetch(req);
    const headers = new Headers(response.headers);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "no-referrer");
    headers.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    );
    return new Response(response.body, { status: response.status, headers });
  },
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(
      env.PRESS.get(env.PRESS.idFromName("owner")).tick(
        controller.scheduledTime,
      ),
    );
  },
};
