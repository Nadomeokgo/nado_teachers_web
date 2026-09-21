-- NADO Teachers: 프로필 사진 저장 기능
-- Supabase Dashboard > SQL Editor > New query 에서 한 번 실행하세요.

begin;

alter table public.profiles
  add column if not exists profile_photo_path text;

-- 프로필 사진은 비공개 버킷에 저장합니다.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-photos',
  'profile-photos',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "profile_photos_select_own_or_admin" on storage.objects;
drop policy if exists "profile_photos_insert_own" on storage.objects;
drop policy if exists "profile_photos_update_own" on storage.objects;
drop policy if exists "profile_photos_delete_own" on storage.objects;

-- 선생님은 자신의 폴더만 조회하고, 관리자는 모든 선생님 사진을 조회할 수 있습니다.
create policy "profile_photos_select_own_or_admin"
on storage.objects for select to authenticated
using (
  bucket_id = 'profile-photos'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  )
);

-- 선생님 본인 UUID 폴더에만 업로드·변경·삭제할 수 있습니다.
create policy "profile_photos_insert_own"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "profile_photos_update_own"
on storage.objects for update to authenticated
using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "profile_photos_delete_own"
on storage.objects for delete to authenticated
using (
  bucket_id = 'profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- 일반 사용자가 자신의 사진 경로를 profiles에 저장할 수 있도록 컬럼 권한을 갱신합니다.
revoke update on public.profiles from authenticated;
grant update (
  email, full_name, school, major, phone, bank_name, account_number, bio,
  profile_photo_path, profile_completed_at, updated_at
) on public.profiles to authenticated;
grant select, insert on public.profiles to authenticated;

commit;
