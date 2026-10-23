# Bethel SDA Church Database

A focused membership and Sabbath attendance dashboard for Bethel Seventh-day Adventist Church.

## Run locally

```bash
npm install
npm run dev
```

Open the local Vite URL. Demo credentials are:

- Username: `BETHELadmin`
- Password: `bethelsda12345`

The app uses a MySQL API server. Copy `.env.example` to `.env` and set the MySQL connection values:

```env
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=bethel_app
MYSQL_PASSWORD=your-password
MYSQL_DATABASE=bethel_sda
PORT=3000
```

Run [mysql-schema.sql](./mysql-schema.sql) in MySQL, create an administrator password hash, and insert the administrator into the `users` table. Start the API and frontend in separate terminals:

```bash
npm install
npm run server
npm run dev
```

The Vite development server proxies `/api` requests to port 3000. For production, run `npm run build`, then `NODE_ENV=production npm start`.

## MySQL option

For a MySQL deployment, use [mysql-schema.sql](./mysql-schema.sql). MySQL credentials remain server-side in `.env`; they are never sent to the browser. The API handles login, password hashing, session expiry, member CRUD, and attendance writes. The `login_sessions` table supports the one-hour inactivity timeout already used by the UI.
