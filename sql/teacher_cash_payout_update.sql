-- Existing profiles keep their account details and use the bank-transfer method.
begin;

alter table public.profiles
  add column if not exists payout_method text not null default 'bank_transfer';

alter table public.profiles drop constraint if exists profiles_payout_method_check;
alter table public.profiles add constraint profiles_payout_method_check check (
  payout_method = 'bank_transfer' or (
    payout_method = 'cash' and role = 'teacher'
    and bank_name is null and account_number is null
  )
);

-- Keep the existing completion requirements. A completed teacher can instead
-- select cash, in which case the constraint above requires empty bank details.
alter table public.profiles drop constraint if exists profiles_completion_requires_fields;
alter table public.profiles add constraint profiles_completion_requires_fields check (
  profile_completed_at is null or role = 'admin' or (
    nullif(btrim(coalesce(full_name, '')), '') is not null and
    nullif(btrim(coalesce(school, '')), '') is not null and
    nullif(btrim(coalesce(major, '')), '') is not null and
    nullif(btrim(coalesce(phone, '')), '') is not null and
    nullif(btrim(coalesce(kakao_id, '')), '') is not null and
    nullif(btrim(coalesce(bio, '')), '') is not null and
    (
      payout_method = 'cash' or (
        nullif(btrim(coalesce(bank_name, '')), '') is not null and
        (role <> 'teacher' or account_number is not null) and
        account_number ~ '^[0-9-]{8,40}$'
      )
    )
  )
);

grant update (payout_method) on public.profiles to authenticated;
comment on column public.profiles.payout_method is
  'Teacher settlement method. Cash is self-selected by a foreign student without a Korean bank account.';

notify pgrst, 'reload schema';
commit;
