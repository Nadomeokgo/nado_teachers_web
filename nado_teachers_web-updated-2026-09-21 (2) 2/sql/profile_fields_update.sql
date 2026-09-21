-- 나도 Teachers: 내 정보 수정 및 정산 계좌 필드 추가
-- Supabase Dashboard → SQL Editor → New query에서 한 번만 실행하세요.

begin;

alter table public.profiles
  add column if not exists bank_name text,
  add column if not exists account_number text;

-- 브라우저에서 로그인한 선생님이 본인의 새 계좌 필드를 수정할 수 있도록 컬럼 권한 추가
grant update (bank_name, account_number) on public.profiles to authenticated;

-- 잘못된 공백 값과 계좌번호 형식을 최소한으로 방지
alter table public.profiles
  drop constraint if exists profiles_bank_name_not_blank,
  drop constraint if exists profiles_account_number_format;

alter table public.profiles
  add constraint profiles_bank_name_not_blank
    check (bank_name is null or btrim(bank_name) <> ''),
  add constraint profiles_account_number_format
    check (account_number is null or account_number ~ '^[0-9-]{8,40}$');

comment on column public.profiles.bank_name is '첫 달 수업료 정산 은행명';
comment on column public.profiles.account_number is '첫 달 수업료 정산 계좌번호';

commit;
