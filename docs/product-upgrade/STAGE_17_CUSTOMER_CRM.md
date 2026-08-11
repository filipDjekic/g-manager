# Stage 17 - Customer CRM notes and tags

Customer CRM data is a dedicated aggregate addressed through `/api/v1/customers/{customerId}/crm`. It is not stored in or returned as part of the authentication `User` entity. Reads require `CUSTOMER_READ`; mutations require the new `CUSTOMER_CRM_MANAGE` permission assigned only to administrators and owners.

Notes are required bounded text (`VARCHAR(1000)`), versioned independently and retained for 730 days. A daily cleanup removes expired notes without deleting or changing the customer identity. Tags are normalized shared records connected to profiles through a normalized many-to-many relation; profile versioning protects tag removal from stale updates. CRM reads accept a bounded result search over actual note bodies and assigned tag names.

Every note create/update/delete and tag add/remove writes a management audit event. The schema contains no password, token, authentication secret or unrestricted blob field.

The customer detail drawer supports CRM search, note creation/edit/removal and tag assignment/removal while retaining the existing customer history and KPI presentation.
