-- ============================================================
-- 012_shifts_seed.sql : シフト・カレンダーの動作確認用シードデータ
--   今月の確定シフト／来月の募集（受付中）と希望サンプル／
--   定期タスク・各種予定／一部の勤務実績
--
-- ロールバック手順:
--   truncate table public.attendance_records, public.calendar_events,
--     public.shifts, public.shift_requests, public.shift_recruitments
--     restart identity cascade;
-- ============================================================

-- 来月分の募集を受付中にする
insert into public.shift_recruitments (month, status, note)
values (
  date_trunc('month', (now() at time zone 'Asia/Tokyo')::date + interval '1 month')::date,
  'open',
  '20日までに提出をお願いします'
);

-- 今月の確定シフト（スタッフ3名 × 営業日。月曜定休の想定）
insert into public.shifts (staff_id, store_id, date, start_time, end_time, status)
select
  st.id,
  coalesce(st.store_id, 1),
  d::date,
  case when st.id % 2 = 0 then time '10:00' else time '11:00' end,
  case when st.id % 2 = 0 then time '19:00' else time '20:00' end,
  'confirmed'
from generate_series(
       date_trunc('month', (now() at time zone 'Asia/Tokyo')::date),
       (date_trunc('month', (now() at time zone 'Asia/Tokyo')::date) + interval '1 month' - interval '1 day'),
       interval '1 day'
     ) d
cross join public.staff st
where extract(dow from d) <> 1                  -- 月曜定休
  and (extract(day from d)::int + st.id) % 4 <> 0;  -- スタッフごとに週1〜2日休み

-- 確認済みチェック（一部スタッフのみ → 管理画面で未確認者が分かる）
update public.shifts
set acknowledged_at = now()
where staff_id = (select min(id) from public.staff where role = 'staff')
  and status = 'confirmed';

-- 勤務実績（過去日の一部。残業・早退の理由付きサンプルを含む）
insert into public.attendance_records (shift_id, actual_start, actual_end, diff_reason)
select s.id, s.start_time,
       case when extract(day from s.date)::int % 7 = 3
            then s.end_time + interval '45 minutes'  -- 残業
            else s.end_time end,
       case when extract(day from s.date)::int % 7 = 3
            then '締め作業対応のため45分残業' else null end
from public.shifts s
where s.date < (now() at time zone 'Asia/Tokyo')::date
  and s.status = 'confirmed'
  and extract(day from s.date)::int % 2 = 0;

-- 来月の希望サンプル（スタッフ1名分）
insert into public.shift_requests (staff_id, month, date, type, start_time, end_time, note)
select
  (select min(id) from public.staff where role = 'staff'),
  date_trunc('month', (now() at time zone 'Asia/Tokyo')::date + interval '1 month')::date,
  d::date,
  case
    when extract(day from d)::int % 9 = 0 then 'ng'
    when extract(day from d)::int % 5 = 0 then 'time'
    else 'usual'
  end,
  case when extract(day from d)::int % 5 = 0 then time '12:00' end,
  case when extract(day from d)::int % 5 = 0 then time '18:00' end,
  case when extract(day from d)::int % 9 = 0 then '通院のため' end
from generate_series(
       date_trunc('month', (now() at time zone 'Asia/Tokyo')::date + interval '1 month'),
       (date_trunc('month', (now() at time zone 'Asia/Tokyo')::date + interval '1 month') + interval '9 days'),
       interval '1 day'
     ) d;

-- 共有カレンダーの予定（定期タスク・単発）
insert into public.calendar_events (store_id, date, type, title, repeat_weekday) values
  (1,    date_trunc('month', (now() at time zone 'Asia/Tokyo')::date)::date, 'task', '🔥 燃えるゴミ', 2),
  (1,    date_trunc('month', (now() at time zone 'Asia/Tokyo')::date)::date, 'task', '♻️ ペットボトル', 5),
  (null, date_trunc('month', (now() at time zone 'Asia/Tokyo')::date)::date + 9,  'meeting',  '全体ミーティング', null),
  (2,    date_trunc('month', (now() at time zone 'Asia/Tokyo')::date)::date + 14, 'shooting', 'メニュー撮影', null),
  (null, date_trunc('month', (now() at time zone 'Asia/Tokyo')::date)::date + 16, 'practice', '練習モデル 19時〜', null),
  (null, date_trunc('month', (now() at time zone 'Asia/Tokyo')::date)::date + 20, 'todo',     'ブログ更新', null),
  (1,    date_trunc('month', (now() at time zone 'Asia/Tokyo')::date)::date + 12, 'change',   '⚠ 営業時間変更 〜18時', null),
  (null, (date_trunc('month', (now() at time zone 'Asia/Tokyo')::date) + interval '1 month' - interval '1 day')::date, 'closing', '月末締め作業', null);
