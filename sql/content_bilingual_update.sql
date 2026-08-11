-- NADO Teachers: 공지사항/자료/교육영상 영문 필드 추가
-- Supabase Dashboard → SQL Editor → New query에서 한 번 실행하세요.

begin;

alter table public.announcements
  add column if not exists title_en text,
  add column if not exists body_en text;

alter table public.resources
  add column if not exists title_en text,
  add column if not exists description_en text;

alter table public.training_videos
  add column if not exists title_en text,
  add column if not exists description_en text;

commit;
