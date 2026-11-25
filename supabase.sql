-- 교실 온도 처방전 — Supabase 표 만들기
-- Supabase 대시보드 → SQL Editor → New query → 전부 붙여 넣고 Run

create table if not exists readings (          -- F-01 측정값 (1분에 한 줄)
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  source text,                                 -- microbit / manual
  temp_raw real, temp_c real, humid_pct real, press_hpa real,
  motion int, light int, sound int
);

create table if not exists prescriptions (     -- F-03 '처방대로 맞췄어요'를 누를 때마다 한 줄
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  indoor real, outdoor real, forecast real, window_open boolean,
  mode text, set_temp real, reason text
);

create table if not exists votes (             -- F-05 체감 투표
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  vote text check (vote in ('cold', 'ok', 'hot')),
  indoor real
);

-- RLS: 브라우저(anon 키)는 "추가"와 "읽기"만 가능. 고치기·지우기는 막힘
alter table readings      enable row level security;
alter table prescriptions enable row level security;
alter table votes         enable row level security;

create policy "anon insert" on readings      for insert to anon with check (true);
create policy "anon read"   on readings      for select to anon using (true);
create policy "anon insert" on prescriptions for insert to anon with check (true);
create policy "anon read"   on prescriptions for select to anon using (true);
create policy "anon insert" on votes         for insert to anon with check (true);
create policy "anon read"   on votes         for select to anon using (true);
