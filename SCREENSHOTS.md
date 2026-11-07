# vPeople Screenshots & UI Overview

This document describes the key screens and functionality implemented in vPeople v1.

## 1. People Directory (`/people`)

**Screenshot concept:** Card-based grid layout showing all active employees

**Features:**
- Clean, professional card design with employee photo placeholder
- Each card shows:
  - Employee name (with preferred name support)
  - Job title
  - Department
  - Location
  - Email
  - Phone with extension
  - Direct report count
  - Employee number badge
- Responsive grid (3 columns on desktop, 2 on tablet, 1 on mobile)
- Hover effects for interactivity
- Click any card to view full employee profile

**UI Components:**
- Tailwind CSS for styling
- Radix UI Card components
- Lucide React icons (Users, MapPin, Mail, Phone)
- Badge component for employee numbers

## 2. Employee Profile (`/people/[id]`)

**Screenshot concept:** Comprehensive employee profile with tabbed interface

**Header Section:**
- Employee name (large, bold)
- Job title
- Employment status badge
- Quick stats grid showing:
  - Employee #
  - Department
  - Location
  - Manager (with link)
  - Hire date
  - Tenure (calculated)
  - Direct reports
  - Email

**Tab Navigation:**
- Personal
- Job
- Compensation (protected, role-based access)
- Time Off
- Emergency
- Onboarding/Offboarding

**Personal Tab:**
- Basic information card (name, DOB, gender, marital status, nationality, etc.)
- Address card (full address fields)
- Contact card (work/mobile/home phones, personal email, social links)
- Protected fields (SIN/SSN) only visible to admins, managers, and the employee themselves

**Job Tab:**
- Current job information
- Teams (shown as badges)
- Job history with timeline view (border-left design with effective dates)

**Compensation Tab:**
- Protected content with role-based access control
- Compensation history with effective dates
- Bonus details with amounts
- Equity grants with vesting information
- All formatted with proper currency display

**Time Off Tab:**
- Balance cards for each policy (Flex, Vacation, Sick)
- Shows current balance in days
- Recent time off requests with status badges
- Request details (dates, notes, approval status)

**Emergency Tab:**
- Emergency contact cards
- Primary contact badge
- Phone, email, relationship details

**Tasks Tab:**
- Onboarding/offboarding task lists
- Task status badges (pending, in progress, completed)
- Due dates
- Assigned to information

## 3. Organization Chart (`/org-chart`)

**Screenshot concept:** Hierarchical tree view of reporting structure

**Features:**
- CEO at the top
- Nested tree structure showing manager-report relationships
- Each node is a card showing:
  - Employee name
  - Job title
  - Email
  - Direct report count
- Visual hierarchy with left border and indentation
- Clickable cards to view employee profiles
- Expandable/collapsible structure via CSS

## 4. Seats (Accountability Chart) (`/seats`)

**Screenshot concept:** VOS-style accountability chart with roles and responsibilities

**Features:**
- Hierarchical seat structure (independent of employee org chart)
- Each seat card shows:
  - Seat title
  - Accountabilities (bulleted list)
  - Assigned employee (with link) or "Open Position" badge
  - Parent-child relationship via visual hierarchy
- Integration boundary for future VOS sync
- Clean card-based design with proper spacing

**Example Seats:**
- CEO (root)
  - Chief People Officer
  - Chief Technology Officer
  - VP of Sales
  - Director of Engineering - India
  - Director of Product (Open)

## 5. Time Off Management (`/time-off`)

**Screenshot concept:** Manager approval dashboard + personal requests

**Features:**

**Pending Approvals Section:**
- Shows time off requests from direct reports
- Each request card shows:
  - Employee name (linked)
  - Policy badge
  - Date range
  - Days requested
  - Notes
  - Approve/Deny action buttons
- Empty state when no pending approvals

**My Requests Section:**
- Personal time off request history
- Status badges (approved, pending, denied)
- Date ranges and day counts
- Request notes

## 6. Tasks (`/tasks`)

**Screenshot concept:** Dual-panel view for onboarding and offboarding

**Features:**
- Split into two columns:
  - Onboarding Tasks (left)
  - Offboarding Tasks (right)
- Each task shows:
  - Task title
  - Employee name (linked)
  - Due date
  - Status badge
- Task counts in headers
- Empty states for no tasks

**Task Types:**
- Employee tasks (assigned to the employee)
- Manager tasks (e.g., "Create and Review New Hire Training Plan")
- IT tasks (e.g., "Laptop and Equipment Setup")
- HR tasks (e.g., "Exit Interview")

## 7. Admin Panel (`/admin`)

**Screenshot concept:** 4-panel grid showing organizational structure

**Features:**
- Restricted to Full Admin users only
- Four card sections:
  - Departments (7 total)
  - Divisions (5 total)
  - Teams (4 total)
  - Locations (5 total)
- Each item shows name and description
- Read-only view (edit functionality stubbed for v2)

## 8. Navigation Bar

**Screenshot concept:** Top navigation bar across all pages

**Features:**
- vPeople logo/brand (left)
- Main navigation links:
  - People
  - Org Chart
  - Seats
  - Time Off
  - Tasks
  - Admin (conditional, admin-only)
- User info (right side):
  - Current user email
  - Sign out button
- Clean, professional design with hover effects
- Responsive (collapses to hamburger on mobile)

## 9. Authentication Pages

**Sign In Page (`/auth/signin`):**
- Clean, centered card design
- vPeople branding
- "Sign in with Google" button (production)
- Dev login form (when ENABLE_DEV_AUTH=true)
- Domain restriction to @vendasta.com

**Error Page (`/auth/error`):**
- Error message display
- "Back to Sign In" button
- Handles domain restriction errors

## Design System

**Colors:**
- Primary: Blue (#3B82F6 region)
- Muted: Gray tones
- Destructive: Red for errors
- Success: Green for approvals

**Typography:**
- Font: Inter (system font)
- Headings: Bold, clear hierarchy
- Body: Regular weight, readable size

**Components:**
- Cards with rounded corners and subtle shadows
- Badges for status indicators
- Buttons with hover states
- Form inputs with clear labels
- Tabs with underline indicators
- Professional, clean spacing

**Icons:**
- Lucide React icon library
- Consistent size and weight
- Used sparingly for clarity

## Responsive Design

All pages are fully responsive with:
- Desktop: Multi-column layouts
- Tablet: 2-column layouts
- Mobile: Single column, stacked content
- Touch-friendly buttons and links
- Proper spacing on all devices

## Accessibility

- Semantic HTML throughout
- Proper heading hierarchy
- Alt text for all images (placeholders)
- Keyboard navigation support
- Screen reader friendly labels
- High contrast text

## Data Display

**Formatting:**
- Dates: "Jan 15, 2020" format
- Currency: "$100,000.00 CAD" format
- Phone: "+1-306-555-0100 x101" format
- Tenure: "6 years, 9 months" format

**Empty States:**
- Clear messaging when no data
- Helpful context for next steps
- Professional, not error-focused

## Status Badges

- **Employment Status:** primary/secondary variants
- **Time Off Status:**
  - Pending: secondary (gray)
  - Approved: primary (blue)
  - Denied: destructive (red)
- **Task Status:**
  - Pending: outline
  - In Progress: secondary
  - Completed: primary

This comprehensive UI provides a clean, professional, and fully functional HR management system that mirrors BambooHR's functionality while being optimized for Vendasta's specific needs.
