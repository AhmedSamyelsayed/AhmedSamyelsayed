-- =============================================================================
-- 0003 Storage buckets and policies
-- Every object path starts with {company_id}/ (CONTEXT.md section 4.4).
-- Both buckets are private; the app serves files through short-lived signed URLs.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'company-assets', 'company-assets', false, 5242880,
    array['image/png', 'image/jpeg', 'image/webp']
  ),
  (
    'documents', 'documents', false, 20971520,
    array[
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/png',
      'image/jpeg',
      'image/webp'
    ]
  )
on conflict (id) do nothing;

-- First path segment as a company id; null when it is not a valid uuid.
create or replace function public.storage_company_id(_object_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  return split_part(_object_name, '/', 1)::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

-- company-assets (logos): members read, org.manage writes
create policy "figure company-assets: members read"
on storage.objects for select
to authenticated
using (
  bucket_id = 'company-assets'
  and public.is_member(public.storage_company_id(name))
);

create policy "figure company-assets: org.manage inserts"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'company-assets'
  and public.has_permission(public.storage_company_id(name), 'org.manage')
);

create policy "figure company-assets: org.manage updates"
on storage.objects for update
to authenticated
using (
  bucket_id = 'company-assets'
  and public.has_permission(public.storage_company_id(name), 'org.manage')
)
with check (
  bucket_id = 'company-assets'
  and public.has_permission(public.storage_company_id(name), 'org.manage')
);

create policy "figure company-assets: org.manage deletes"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'company-assets'
  and public.has_permission(public.storage_company_id(name), 'org.manage')
);

-- documents: documents.read reads all, members read their own uploads;
-- uploaders insert; objects are immutable (no update policy).
create policy "figure documents: read"
on storage.objects for select
to authenticated
using (
  bucket_id = 'documents'
  and (
    public.has_permission(public.storage_company_id(name), 'documents.read')
    or (
      owner_id = (select auth.uid())::text
      and public.is_member(public.storage_company_id(name))
    )
  )
);

create policy "figure documents: upload"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'documents'
  and (
    public.has_permission(public.storage_company_id(name), 'documents.upload')
    or public.has_permission(public.storage_company_id(name), 'timesheets.upload')
  )
);

create policy "figure documents: delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'documents'
  and public.has_permission(public.storage_company_id(name), 'documents.upload')
);
