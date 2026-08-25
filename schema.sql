-- LOYALTY ACADEMY DATABASE
-- Run this entire file in Supabase SQL Editor.
-- Security note: teacher accounts are created as "student" by default when they request teacher access.
-- An administrator must promote an approved teacher with:
-- UPDATE public.profiles SET role='teacher' WHERE id='USER_UUID';

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null default 'student' check (role in ('student','teacher','admin')),
  requested_role text not null default 'student' check (requested_role in ('student','teacher')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.enrollments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(class_id, student_id)
);

create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  title text not null,
  description text,
  due_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  content text,
  submitted_at timestamptz not null default now(),
  grade numeric check (grade is null or (grade >= 0 and grade <= 100)),
  feedback text,
  unique(assignment_id, student_id)
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, requested_role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    case
      when new.raw_user_meta_data->>'requested_role' = 'teacher' then 'teacher'
      else 'student'
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
for each row execute procedure public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.classes enable row level security;
alter table public.enrollments enable row level security;
alter table public.assignments enable row level security;
alter table public.submissions enable row level security;

-- Profiles: users can read/update their own profile.
create policy "profiles_select_own" on public.profiles
for select to authenticated using (id = auth.uid());

create policy "profiles_update_own" on public.profiles
for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Teachers/admins can read profiles needed for their school work.
create policy "teachers_read_profiles" on public.profiles
for select to authenticated
using (
  exists (select 1 from public.profiles me where me.id = auth.uid() and me.role in ('teacher','admin'))
);

-- Classes: authenticated users can see classes they teach or are enrolled in.
create policy "classes_read" on public.classes
for select to authenticated
using (
  teacher_id = auth.uid()
  or exists (
    select 1 from public.enrollments e
    where e.class_id = classes.id and e.student_id = auth.uid()
  )
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

create policy "teachers_create_classes" on public.classes
for insert to authenticated
with check (
  teacher_id = auth.uid()
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('teacher','admin'))
);

create policy "teachers_update_classes" on public.classes
for update to authenticated
using (
  teacher_id = auth.uid()
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
)
with check (
  teacher_id = auth.uid()
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

create policy "teachers_delete_classes" on public.classes
for delete to authenticated
using (
  teacher_id = auth.uid()
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- Enrollments: students can see their own; teachers can see students in their classes.
create policy "enrollments_read" on public.enrollments
for select to authenticated
using (
  student_id = auth.uid()
  or exists (
    select 1 from public.classes c
    where c.id = enrollments.class_id and c.teacher_id = auth.uid()
  )
  or exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
  )
);

create policy "teachers_manage_enrollments" on public.enrollments
for all to authenticated
using (
  exists (select 1 from public.classes c where c.id = enrollments.class_id and c.teacher_id = auth.uid())
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
)
with check (
  exists (select 1 from public.classes c where c.id = enrollments.class_id and c.teacher_id = auth.uid())
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- Assignments: enrolled students can read; teachers can manage their own.
create policy "assignments_read" on public.assignments
for select to authenticated
using (
  exists (select 1 from public.classes c where c.id = assignments.class_id and c.teacher_id = auth.uid())
  or exists (
    select 1 from public.enrollments e
    where e.class_id = assignments.class_id and e.student_id = auth.uid()
  )
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

create policy "teachers_create_assignments" on public.assignments
for insert to authenticated
with check (
  exists (select 1 from public.classes c where c.id = assignments.class_id and c.teacher_id = auth.uid())
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

create policy "teachers_update_assignments" on public.assignments
for update to authenticated
using (
  exists (select 1 from public.classes c where c.id = assignments.class_id and c.teacher_id = auth.uid())
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
)
with check (
  exists (select 1 from public.classes c where c.id = assignments.class_id and c.teacher_id = auth.uid())
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

create policy "teachers_delete_assignments" on public.assignments
for delete to authenticated
using (
  exists (select 1 from public.classes c where c.id = assignments.class_id and c.teacher_id = auth.uid())
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- Submissions: students manage their own; teachers can read/grade submissions for their classes.
create policy "submissions_read" on public.submissions
for select to authenticated
using (
  student_id = auth.uid()
  or exists (
    select 1 from public.assignments a
    join public.classes c on c.id = a.class_id
    where a.id = submissions.assignment_id and c.teacher_id = auth.uid()
  )
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

create policy "students_create_submissions" on public.submissions
for insert to authenticated
with check (
  student_id = auth.uid()
  and exists (
    select 1 from public.enrollments e
    join public.assignments a on a.class_id = e.class_id
    where e.student_id = auth.uid() and a.id = submissions.assignment_id
  )
);

create policy "students_update_own_submissions" on public.submissions
for update to authenticated
using (student_id = auth.uid())
with check (student_id = auth.uid());

create policy "teachers_grade_submissions" on public.submissions
for update to authenticated
using (
  exists (
    select 1 from public.assignments a
    join public.classes c on c.id = a.class_id
    where a.id = submissions.assignment_id and c.teacher_id = auth.uid()
  )
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
)
with check (
  exists (
    select 1 from public.assignments a
    join public.classes c on c.id = a.class_id
    where a.id = submissions.assignment_id and c.teacher_id = auth.uid()
  )
  or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- Helpful indexes
create index if not exists classes_teacher_id_idx on public.classes(teacher_id);
create index if not exists enrollments_student_id_idx on public.enrollments(student_id);
create index if not exists enrollments_class_id_idx on public.enrollments(class_id);
create index if not exists assignments_class_id_idx on public.assignments(class_id);
create index if not exists submissions_student_id_idx on public.submissions(student_id);
create index if not exists submissions_assignment_id_idx on public.submissions(assignment_id);

-- OPTIONAL TEST DATA
-- After creating a real teacher account and promoting it, replace TEACHER_UUID below.
-- insert into public.classes(name,description,teacher_id)
-- values ('Welcome Class','Introduction to Loyalty Academy','TEACHER_UUID');
