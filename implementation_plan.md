# Smart Parking Management System — Implementation Plan

## 1. Project Overview

The Smart Parking Management System connects parking facilities with drivers through a single platform.

Users can search for parking based on their location, pre-book parking, and make payments. At entry and exit, cameras capture the vehicle number plate, and the **Gemini Vision API** is used to recognize the vehicle number for booking verification and parking-session tracking.

The platform consists of three panels:

* **Platform Admin Panel**
* **Parking Owner Panel**
* **User/Driver Panel**

The application follows a **modular monolithic architecture**, with all backend modules running within a single Node.js/Express application.

---

## 2. User/Driver Panel

### Authentication & Profile

Users can:

* Register and log in.
* Manage their profile.
* View booking history.
* View payment history.

### Parking Discovery

Users can search for parking facilities based on their location.

The system displays relevant parking facilities along with their:

* Name
* Location
* Availability
* Vehicle-specific rates
* Rating
* EV charging availability
* 24/7 availability

### Parking Reservation

Reservations are made for the current day.

During pre-booking, the user provides:

* Vehicle number
* Vehicle type
* Parking duration
* Expected entry time
* Expected exit time

The vehicle number is used for verification when the vehicle reaches the parking facility.

The system generates a **Booking ID** and stores the required reservation information. No QR code is generated.

The system does **not** support:

* Booking cancellation
* Refunds
* Booking expiry

---

## 3. Camera-Based Entry & Exit

### Entry

When a vehicle reaches the parking entrance:

```text
Camera
   ↓
Vehicle Image
   ↓
Gemini Vision API
   ↓
Recognized Vehicle Number
   ↓
Backend
   ↓
Find Active Booking
   ↓
Verify Vehicle Number
   ↓
Allow Entry
```

The system verifies that:

* The vehicle has an active booking.
* The booking belongs to the selected parking facility.
* The recognized vehicle number matches the booked vehicle.
* The vehicle is within the allowed entry time.

After successful verification, the system creates a parking session and records the actual entry time.

### Exit

At the exit:

```text
Camera
   ↓
Vehicle Image
   ↓
Gemini Vision API
   ↓
Recognized Vehicle Number
   ↓
Find Active Parking Session
   ↓
Calculate Duration
   ↓
Calculate Overstay
   ↓
Generate Final Bill
   ↓
Close Parking Session
```

The system automatically calculates the actual parking duration and determines whether the vehicle has overstayed.

---

## 4. Billing & Dynamic Pricing

### Overstay Billing

Overstay is calculated using:

```text
Actual Exit Time - Expected Exit Time
```

If the vehicle exceeds the booked duration, an additional charge is generated according to the applicable pricing rules.

The **overdue/overstay duration is calculated by the system** and does not need to be entered by the user during booking.

### Dynamic Pricing

Parking prices are dynamically determined using only:

* Occupancy
* Peak hours
* Location
* Day of the week

The pricing system should support separate rates for:

* Two-wheelers
* Four-wheelers

The calculated booking price should be stored with the reservation.

---

## 5. Parking Owner Panel

Parking owners can:

* Register parking facilities.
* Edit parking facility information.
* Configure parking capacity.
* Configure operating hours.
* Set two-wheeler rates.
* Set four-wheeler rates.
* Configure dynamic pricing rules.
* Manage EV charging availability.
* View reservations.
* View active parking sessions.
* View transactions.
* View parking analytics.

### Parking Analytics

The dashboard can provide:

* Current occupancy
* Total vehicles parked
* Available slots
* Revenue
* Number of reservations
* Average parking duration

---

## 6. Platform Admin Panel

The platform administrator manages the complete application.

Admin capabilities include:

* Manage users.
* Manage parking owners.
* Approve parking facilities.
* Edit or deactivate parking facilities.
* Monitor transactions.
* Manage platform commission.
* View platform-wide analytics.
* Monitor overall parking activity.

---

## 7. Payment System

The system uses the **Razorpay API** for payment processing.

Supported payment flows include:

* Pre-booking payment
* Overstay payment
* Final payment
* Failed payment handling

Payment records should contain:

* Transaction ID
* User ID
* Booking ID
* Parking ID
* Amount
* Payment status
* Timestamp

---

## 8. Security & Fraud Detection

The application should implement:

* JWT authentication
* Role-based authorization
* Password hashing
* Input validation
* API rate limiting
* Secure API configuration
* CORS configuration
* Razorpay payment verification
* Gemini API key protection

The system can flag vehicle mismatches when the number plate recognized at entry does not match the vehicle number stored in the active booking.

The Gemini API key must remain on the backend and must never be exposed to the frontend.

---

## 9. Architecture

The system will use a **modular monolithic architecture** rather than microservices.

All modules will run inside a single Node.js/Express backend.

```text
                    React Frontend
                          │
                          ↓
                  Node.js / Express
                          │
       ┌──────────────────┼──────────────────┐
       │                  │                  │
    Auth Module      Parking Module      Booking Module
       │                  │                  │
       ├────────────── Pricing Module ───────┤
       │                  │                  │
       ├────────────── Billing Module ───────┤
       │                  │                  │
       ├────────────── Payment Module ───────┤
       │                  │                  │
       └────────── Vehicle Recognition ──────┘
                          │
                 ┌────────┴────────┐
                 ↓                 ↓
              MongoDB           Redis
```

### Backend Modules

* Authentication
* User Management
* Parking Management
* Booking Management
* Pricing
* Parking Session
* Billing
* Payment
* Vehicle Recognition
* Analytics
* Admin Management

These are **logical modules**, not separate deployable services.

---

## 10. Redis Usage

Redis can be used for:

* Parking availability caching.
* Caching frequently accessed parking information.
* Temporary booking/session data.
* Distributed locks.
* Rate limiting.

Redis locks can prevent race conditions when multiple users attempt to reserve the remaining parking capacity simultaneously.

---

## 11. Database Design

MongoDB will be used as the primary database.

Possible collections:

```text
users
parkingOwners
parkingLots
bookings
parkingSessions
transactions
pricingRules
vehicleRecognitionEvents
```

### Parking Lot Registration Model

A parking lot should contain:

```text
Name
Contact
 ├── Email
 └── Phone

Location

Total Capacity
 ├── Two-Wheeler
 └── Four-Wheeler

Rate / Hour
 ├── Two-Wheeler
 └── Four-Wheeler

Rating

Current Vehicles Parked
 ├── Two-Wheeler
 └── Four-Wheeler

Available Slots
 ├── Two-Wheeler
 └── Four-Wheeler

24/7 Service
EV Charging Facility
```

### User Registration Model

Basic user information:

```text
Name
Email
Password
```

Vehicle information does not need to be maintained as a permanent vehicle registry.

During pre-booking:

```text
Vehicle Number
Vehicle Type
Parking Duration
Entry Time
Exit Time
```

The vehicle number is associated with the booking/parking session for verification.

The **overstay duration is calculated automatically at exit**.

---

## 12. Core System Flow

```text
User
  ↓
Select Location
  ↓
View Parking Facilities
  ↓
Select Parking
  ↓
Enter Vehicle Details
  ↓
Select Parking Duration
  ↓
Select Entry/Exit Time
  ↓
Dynamic Price Calculation
  ↓
Razorpay Payment
  ↓
Booking Created
  ↓
Vehicle Arrives
  ↓
Camera Captures Number Plate
  ↓
Gemini Vision API
  ↓
Vehicle Number Recognition
  ↓
Booking Verification
  ↓
Vehicle Entry
  ↓
Parking Session Created
  ↓
Vehicle Exits
  ↓
Camera Captures Number Plate
  ↓
Gemini Vision API
  ↓
Vehicle Verification
  ↓
Calculate Parking Duration
  ↓
Calculate Overstay
  ↓
Generate Additional Charge
  ↓
Payment
  ↓
Parking Session Closed
```

---

## 13. Technology Stack

### Frontend

```text
React.js
Vite
Tailwind CSS
Axios
React Router
```

### Backend

```text
Node.js
Express.js
JWT
Axios
```

### Database & Cache

```text
MongoDB
Redis
```

### Vehicle Recognition

```text
Gemini Vision API
Camera/Image Input
```

### Payment

```text
Razorpay API
```

### Infrastructure

```text
Docker
Docker Compose
Nginx
```

### Version Control

```text
Git
GitHub
```

---

## 14. Core System-Design Concepts

The project can demonstrate:

* Modular monolithic architecture
* REST APIs
* API authentication
* Role-based authorization
* MongoDB database design
* Database indexing
* Redis caching
* Redis distributed locks
* Concurrency control
* Dynamic pricing
* Payment integration
* AI API integration
* Vehicle-number recognition
* Overstay calculation
* Docker-based development
* Horizontal scaling
* Rate limiting
* Secure API design

---

## 15. Future Scope

Possible future additions:

* Dedicated custom ANPR model instead of Gemini API.
* IoT-based parking sensors.
* EV charging management.
* Advanced demand prediction.
* Mobile applications.
* Monthly parking subscriptions.
* Corporate parking plans.
* Multi-city support.
* Advanced parking analytics.
