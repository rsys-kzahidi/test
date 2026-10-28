/**
 * Sample "extracted" text simulating what the PDF/DOCX parser produces for a
 * small design specification. Used by the "Load sample document" button so the
 * app is fully demoable without uploading a file, and by unit tests.
 */
export const SAMPLE_DOCUMENT_NAME = 'acme-orders-portal-spec.pdf'

export const SAMPLE_DOCUMENT_TEXT = `Acme Orders Portal – UI Design Specification
Version 1.2 · Prepared by the Product Design team

Screen 1: Login
Description: Lets registered users sign in to the orders portal with their work email and password.
Layout:
• Header with company logo
• Centered sign-in card
• Footer with privacy and support links
Fields:
• Email address
• Password
• Remember me (checkbox)
Buttons: Sign in, Forgot password
\f
Screen 2: Dashboard
Description: Landing page after login showing key order metrics and the most recent orders.
Sections:
• KPI summary cards (Total orders, Revenue, Pending shipments, Returns)
• Recent orders table
• Monthly sales chart
Fields:
• Date range (select: Last 7 days, Last 30 days, This quarter, This year)
• Search orders
Buttons: Refresh, Export CSV, New order
\f
Screen 3: Customer List
Description: Searchable, paginated list of customers with their status and lifetime value.
Sections:
• Filter bar
• Customers table with columns Name, Email, Phone, Status, Lifetime value
• Pagination
Fields:
• Search by name or email
• Status (dropdown: Active, Inactive, Prospect)
Buttons: Add customer, Apply filters, Reset
\f
Screen 4: Create Order
Description: Form used by sales reps to create a new order for an existing customer.
Layout:
• Order form in two columns
• Order summary sidebar
Fields:
• Customer name
• Contact email
• Product (select: Laptop Pro 14, 27" Monitor, Mechanical Keyboard, USB-C Dock)
• Quantity
• Unit price
• Delivery date
• Express shipping (checkbox)
• Notes
Buttons: Save draft, Submit order, Cancel
`
