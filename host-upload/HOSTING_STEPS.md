# Hosting Steps

Upload this whole `host-upload` folder's contents to a VPS or Node.js host.

Do not upload this folder inside `public_html` or another public web folder. If you do, LiteSpeed will show a directory listing like `Index of /mod.dashboard/` and your source files, database, or `.env` can become public. Put the bot in a private app folder, then point a Node.js app to it.

Do not upload this folder to a public file-sharing site because `.env` contains private bot secrets.

On the host, run:

```bash
npm install
npm run check
npm start
```

For 24/7 running on a VPS:

```bash
npm install -g pm2
pm2 start src/index.js --name discord-bot
pm2 save
pm2 startup
```

Dashboard URL on the server:

```text
http://SERVER_IP:3000
```

For cPanel or Spaceship hosting, create a Node.js app instead of serving the folder as static website files:

- App root: the private bot folder, not `public_html/mod.dashboard`.
- Startup file: `src/index.js`.
- App URL: `/mod.dashboard/` if you want that dashboard path.
- Run `npm install`, set the `.env` values, then restart the Node.js app.

The app uses the host-provided `PORT` or `SERVER_PORT` when a host provides one, otherwise it falls back to `DASHBOARD_PORT`.

For safer public hosting, keep `DASHBOARD_HOST=127.0.0.1` and expose it with Cloudflare Tunnel.
