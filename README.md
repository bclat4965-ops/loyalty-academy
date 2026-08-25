# Loyalty Academy

A responsive school portal with Supabase authentication, student/teacher roles, dashboards, classes, assignments, enrollments, and submissions.

## Files

- `index.html` — website UI
- `styles.css` — yellow/green/white design
- `app.js` — Supabase authentication and dashboard logic
- `schema.sql` — database tables, trigger, indexes and Row Level Security
- `README.md` — setup instructions

## Setup

1. Create a Supabase project.
2. Open Supabase -> SQL Editor.
3. Paste and run all of `schema.sql`.
4. Open `app.js`.
5. Replace:
   - `YOUR_SUPABASE_URL`
   - `YOUR_SUPABASE_ANON_KEY`
   with the Project URL and publishable/anon key from Supabase Project Settings -> API.
6. Upload all files to GitHub Pages, Netlify, or another static host.

## Email confirmation

Supabase may require users to confirm their email before the first login. Configure this in Authentication -> Providers/Email and set your Site URL / Redirect URLs to your deployed website.

## Teacher approval

For safety, a user who signs up requesting a teacher account is NOT automatically granted the teacher role. The database stores `requested_role='teacher'`, but the account role stays `student`.

After verifying a teacher, promote them from the Supabase SQL Editor:

```sql
update public.profiles
set role = 'teacher'
where id = 'THE_USER_UUID';
```

Then that user will see the teacher dashboard after logging in again.

## Creating a class

Once a teacher has been promoted, you can create a class in SQL for testing:

```sql
insert into public.classes (name, description, teacher_id)
values (
  'Mathematics',
  'Year 10 Mathematics',
  'THE_TEACHER_UUID'
);
```

## Security

- Never put the Supabase service-role/secret key in browser code.
- Only the public publishable/anon key belongs in `app.js`.
- Row Level Security policies in `schema.sql` control access to school data.
- For a real school deployment, add stronger staff verification, moderation, backups, privacy policies, and an admin workflow before using real student data.

## Important

This starter includes real Supabase signup/login and protected database access. Teacher dashboard actions are currently represented by dashboard data views; class/assignment creation UI can be added next.
