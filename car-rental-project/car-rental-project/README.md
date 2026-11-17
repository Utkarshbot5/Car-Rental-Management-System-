# DriveEase – Car Rental Project

A full-stack **Car Rental Management System** built for the Full Stack Development course (Semester 7).
Customers can browse cars, book them by the hour and track their bookings. Admins manage cars, owners, customers and bookings.

> Inspired by the OOP "Rent-a-Car Management System" (Car / CarOwner / Customer / Booking model), rebuilt as a modern web application.

## Features

**Customer**
- Register / log in (JWT authentication, bcrypt-hashed passwords)
- Browse and filter cars by name, type, seats, max price and **availability window**
- Live price quote while choosing pick-up and return time
- Book a car (double-booking is prevented), view and cancel bookings, see total bill

**Admin**
- Dashboard with totals and revenue
- Add / edit / delete cars (with owner, status, rate)
- Manage car owners and pay out their balance
- View all customers and their total billing
- View all bookings, mark a car as **returned** (final bill is calculated, owner is credited 80%)

## Tech stack

| Layer     | Technology                                         |
|-----------|----------------------------------------------------|
| Frontend  | HTML5, CSS3, vanilla JavaScript (single-page app)  |
| Backend   | Node.js, Express 5 (REST API)                      |
| Database  | SQLite (better-sqlite3), auto-created and seeded   |
| Auth      | JSON Web Tokens + bcryptjs, role-based access      |
| Security  | helmet, CORS, parameterised SQL, HTML escaping     |
| Deploy    | Render (`render.yaml`) or Docker (`Dockerfile`)    |

## Project structure

```
car-rental-project/
├── server.js              # Express app entry point
├── src/
│   ├── db.js              # SQLite schema + seed data
│   ├── auth.js            # JWT helpers and role middleware
│   └── routes/
│       ├── auth.js        # register, login, me
│       ├── cars.js        # list/search + admin CRUD
│       ├── bookings.js    # quote, book, cancel, return
│       └── admin.js       # stats, owners, customers
├── public/                # Frontend (served statically)
│   ├── index.html
│   ├── css/style.css
│   └── js/app.js
├── tests/smoke.test.js    # End-to-end API test (npm test)
├── render.yaml  Dockerfile  .env.example  .gitignore
```

## Run locally

Requires Node.js 18 or newer.

```bash
npm install
npm start
```

Open <http://localhost:3000>.

| Role     | Username | Password   |
|----------|----------|------------|
| Admin    | `admin`  | `admin123` |
| Customer | `demo`   | `demo123`  |

Run the automated test: `npm test`

## Database design

```
users(id, username, name, email, phone, password_hash, role)
owners(id, name, cnic, contact_no, balance)
cars(id, name, make, model, reg_no, colour, condition, type, seating_capacity,
     rent_per_hour, status, owner_id -> owners)
bookings(id, user_id -> users, car_id -> cars, rent_time, return_time,
         hours, bill, status[active|returned|cancelled])
```

Billing: `bill = ceil(hours) × rent_per_hour` (minimum 1 hour). When a car is returned late, the extra hours are billed. The owner's balance increases by 80% of the final bill.

## API reference

| Method | Endpoint                          | Access   | Description                          |
|--------|-----------------------------------|----------|--------------------------------------|
| POST   | `/api/auth/register`              | Public   | Create customer account              |
| POST   | `/api/auth/login`                 | Public   | Log in, returns JWT                  |
| GET    | `/api/auth/me`                    | User     | Current user                         |
| GET    | `/api/cars`                       | Public   | List/search (`q,type,seats,maxPrice,from,to`) |
| GET    | `/api/cars/:id`                   | Public   | Car details                          |
| POST/PUT/DELETE | `/api/cars[/:id]`        | Admin    | Manage cars                          |
| GET    | `/api/bookings/quote`             | Public   | Price for a time range               |
| POST   | `/api/bookings`                   | User     | Create booking                       |
| GET    | `/api/bookings`                   | User     | Own bookings (admin: all)            |
| POST   | `/api/bookings/:id/cancel`        | User     | Cancel a booking                     |
| POST   | `/api/bookings/:id/return`        | Admin    | Return car, finalise bill            |
| GET    | `/api/admin/stats`                | Admin    | Dashboard numbers                    |
| CRUD   | `/api/admin/owners`               | Admin    | Manage owners, `POST /:id/payout`    |
| GET    | `/api/admin/customers`            | Admin    | Customers with total bill            |

## Upload to GitHub

```bash
cd car-rental-project
git init
git add .
git commit -m "Car rental full-stack project"
git branch -M main
git remote add origin https://github.com/<your-username>/car-rental-project.git
git push -u origin main
```

(Create an empty repository named `car-rental-project` on github.com first.)

## Deploy (free) on Render

1. Push the project to GitHub (above).
2. On [render.com](https://render.com) choose **New → Blueprint** and select your repository. `render.yaml` configures everything.
   - Or **New → Web Service**: Build command `npm install`, Start command `npm start`.
3. Set the environment variable `ADMIN_PASSWORD` to a password of your choice. `JWT_SECRET` is generated automatically.
4. Open the URL Render gives you.

> **Note:** Render's free plan has a temporary disk, so the SQLite database resets to the seed data when the service restarts or redeploys. For permanent data, attach a Render Disk and set `DB_PATH=/var/data/rental.db`, or move to a hosted database.

Docker alternative: `docker build -t car-rental . && docker run -p 3000:3000 car-rental`

## Possible future improvements

Payment gateway, car photo uploads, email notifications, driver licence verification, reviews and ratings.

## AUTHOR

UTKARSH KUMAR


Output


<img width="1280" height="800" alt="6-admincars" src="https://github.com/user-attachments/assets/afe7a2b3-be97-42fb-80cf-a029894b562b" />
<img width="1280" height="800" alt="3-book" src="https://github.com/user-attachments/assets/dc831245-2c41-4944-aa87-092452af4988" />
<img width="1280" height="800" alt="2-cars" src="https://github.com/user-attachments/assets/760afb03-4808-4ac6-80cb-b2fc48f22706" />
<img width="1280" height="800" alt="1-home" src="https://github.com/user-attachments/assets/8b754681-1fb0-4555-ae9a-1d47ef402f3a" />
