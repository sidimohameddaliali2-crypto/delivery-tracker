# Event Organizer - ITP GRAZE Setup Guide

## Overview
Complete event management system for organizing catering events with logistics, equipment tracking, driver assignment, and company branding.

## Event Details Supported

### Basic Information
- **Event Name** - Name of the event/catering job
- **Company** - Associated company with logo display
- **Company Logo** - Automatically displayed on event cards and details
- **Event Date** - Date of the event
- **Arrival Time** - When driver should arrive (e.g., "3pm", "15:00")

### Location Details
- **Emirate** - Dubai, Abu Dhabi, Sharjah, etc.
- **Venue Type** - Private Villa, Hotel, Restaurant, Beach, Park, Convention Center, Other
- **Address** - Full venue address
- **Area** - Specific area name (e.g., "Al Barsha 3")
- **Google Maps Link** - Map location URL
- **Coordinates** - Latitude/Longitude for GPS tracking

### Equipment & Items (Like ITP GRAZE Table)
- **Equipment List** - Add multiple items
  - Item Name (e.g., "White Table")
  - Description (e.g., "180cm with 2 legs")
  - Dimensions (e.g., "180cm x 90cm")
  - Quantity
  - Images (if needed)

### Logistics & Instructions
- **Number of People** - How many staff traveling (e.g., 2 for Rose & Julie scenario)
- **Staff Names** - Names of all staff members
- **Special Requests** - Any special instructions
  - Example: "Rose will join Julie to the event to witness and learn"
- **Equipment List** - What equipment needs to be transported

### Disassembly Schedule (Same Day Pickup)
- **Disassembly Required** - Yes/No toggle
- **Disassembly Date** - Date for pickup (usually same day)
- **Driver Arrival Time** - When driver arrives for disassembly (e.g., "8:45 pm")
- **Disassembly Time** - When disassembly starts (e.g., "9 pm")
- **Notes** - Any special notes for disassembly

### Driver Assignment
- **Setup Driver** - Assigned for equipment delivery
- **Disassembly Driver** - Assigned for equipment pickup
- **Driver Status Tracking** - Pending, Confirmed, In-transit, Arrived, Completed

## How to Create an Event

1. **Go to Events Page**
   - Click "Events" in sidebar
   - Click "New Event" button

2. **Fill in Event Details**
   ```
   Event Name: ITP GRAZE Catering - Al Barsha Villa
   Company: ITP GRAZE (with logo)
   Event Date: November 25, 2025
   Arrival Time: 3pm
   ```

3. **Add Location**
   ```
   Emirate: Dubai
   Venue Type: Private Villa
   Address: 19 Al Asayel St - Al Barsha 3
   Area: Al Barsha
   Google Maps: [link to location]
   ```

4. **Add Equipment**
   ```
   Click "Add Equipment"
   - Name: White Table
   - Description: 180cm with 2 legs
   - Dimensions: 180cm x 90cm x 80cm
   - Quantity: 1
   ```

5. **Set Logistics**
   ```
   Number of People: 2
   Staff Names: Rose, Julie
   Special Requests: Rose will join Julie to witness and learn
   ```

6. **Add Disassembly**
   ```
   Enable: Disassembly Required
   Disassembly Date: November 25, 2025 (same day)
   Arrival Time: 8:45 pm
   Disassembly Time: 9 pm
   ```

7. **Save Event**
   - Click "Create Event"

## Viewing Event Details

1. **Event Card** shows:
   - Company name & logo
   - Event name
   - Status badge (Pending, Assigned, In Progress, etc.)
   - Event date
   - Arrival time
   - Location (Emirate, Area)
   - Number of people
   - Equipment count
   - Special requests preview
   - Disassembly info

2. **Click "View Details"** to see:
   - Full event timeline
   - Complete equipment list with descriptions
   - All staff assignments
   - Driver assignments & status
   - Budget tracking
   - Photos & documents
   - Complete logistics notes

## Filtering & Search

- **Search Box** - Find by event name, company name, or address
- **Status Filter** - Show events by status:
  - Pending
  - Assigned
  - In Progress
  - Completed
  - Cancelled
- **Emirate Filter** - Filter by location
- **Clear Filters** - Reset all filters

## Event Status Lifecycle

```
Planning → Scheduled → Setup Complete → Event Ongoing → Disassembly Complete → Delivered
```

- **Pending** - Event created, not yet assigned
- **Assigned** - Driver assigned for setup
- **In Progress** - Event is happening
- **Completed** - Setup and disassembly finished
- **Cancelled** - Event cancelled

## Key Features

✅ **Company Branding**
- Display company logo on all event cards
- Company name prominently shown
- Color-coded by status

✅ **Equipment Tracking**
- Add unlimited equipment items
- Track dimensions and descriptions
- Quantity tracking
- Visual equipment count badge

✅ **Logistics Management**
- Staff assignment with names
- Special requests tracking
- Multi-person delivery support
- Equipment transportation notes

✅ **Disassembly Scheduling**
- Separate driver for pickup
- Different arrival and disassembly times
- Same-day or future disassembly
- Status tracking for pickup

✅ **Driver Management**
- Assign setup driver
- Assign disassembly driver
- Track driver status
- View driver contact info

✅ **Search & Filter**
- Quick search by name/address
- Filter by status or emirate
- Sort by date
- Find by company

## ITP GRAZE Example

**Event:** ITP GRAZE Catering at Al Barsha Villa

| Field | Value |
|-------|-------|
| Event Name | ITP GRAZE Catering - Al Barsha Villa |
| Company | ITP GRAZE (logo displayed) |
| Date | Tuesday, November 25, 2025 |
| Emirate | Dubai |
| Venue | Private Villa |
| Address | 19 Al Asayel St, Al Barsha 3 |
| Arrival Time | 3:00 PM |
| Staff | Rose & Julie (2 people) |
| Equipment | White Table (180cm x 2 legs) |
| Special Note | Rose learning/witnessing the event |
| Disassembly Date | Nov 25 (same day) |
| Pickup Time | 8:45 PM |
| Disassembly Time | 9:00 PM |

## API Endpoints

```
POST   /api/events              - Create event
GET    /api/events              - Get all events (with filters)
GET    /api/events/:id          - Get event details
PUT    /api/events/:id          - Update event
DELETE /api/events/:id          - Delete event
PUT    /api/events/:id/status   - Update event status
```

## Notes

- All timestamps in 24-hour or 12-hour format (configurable)
- Company logos auto-load from company profile
- Equipment can be uploaded with images
- Driver assignment sends notifications
- Events integrate with delivery system for multi-stop optimization
- Export event details & create reports

## Next Steps

1. Start using the Events page to create new catering events
2. Assign drivers when ready
3. Update status as event progresses
4. Add photos during/after event
5. Track completion and gather feedback

