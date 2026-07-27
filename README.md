# Water Bill Management System

Integrated frontend + backend application.

## Run

```bash
npm install
npm start
```

Open:

```text
http://localhost:4000
```

Demo login:

```text
alex.d@waterbill.admin
ChangeMe123!
```

## Pages

- Dashboard: `/dashboard.html`
- Building Details: `/building-details.html?id=1`
- House Details: `/house-details.html?id=1`
- Monthly Summary: `/summary.html`
- Settings: `/settings.html`

The app seeds demo admins, buildings, houses, settings, and database tables automatically on startup unless `AUTO_SEED=false` is set.

## API

- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/summary`
- `GET /api/buildings`
- `POST /api/buildings`
- `PUT /api/buildings/:id`
- `DELETE /api/buildings/:id`
- `GET /api/houses/:id`
- `POST /api/houses`
- `PUT /api/houses/:id`
- `DELETE /api/houses/:id`
- `GET /api/bills`
- `POST /api/bills`
- `PUT /api/bills/:id`
- `DELETE /api/bills/:id`
- `GET /api/settings`
- `PUT /api/settings`
