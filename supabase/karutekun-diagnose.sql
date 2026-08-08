-- ============================================================
-- カルテくん取り込み 診断SQL
--   Supabase の SQL Editor にこのまま貼って実行してください。
--   どこで止まっているかが表で出ます。データは一切変更しません。
-- ============================================================
create or replace function public.kk_diag()
returns table (項目 text, 値 text, 判定 text)
language plpgsql
set search_path = public
as $$
declare
  n_karte  bigint := -1;
  n_visits bigint := -1;
  n_items  bigint := -1;
  n_cust   bigint := 0;
  n_visit  bigint := 0;
  v_txt    text;
begin
  ---------------------------------------------------------------
  -- ① 取込テーブル（CSVの置き場）にデータが入っているか
  ---------------------------------------------------------------
  if to_regclass('public.import_karte') is not null then
    execute 'select count(*) from public.import_karte' into n_karte;
  end if;
  if to_regclass('public.import_visits') is not null then
    execute 'select count(*) from public.import_visits' into n_visits;
  end if;
  if to_regclass('public.import_visit_items') is not null then
    execute 'select count(*) from public.import_visit_items' into n_items;
  end if;

  return query select '① 取込テーブル import_karte'::text,
    case when n_karte < 0 then 'テーブルがありません' else n_karte || ' 行' end,
    case when n_karte < 0 then '✗ 01_setup.sql が未実行'
         when n_karte = 0 then '✗ CSVが入っていません'
         else '○' end;
  return query select '① 取込テーブル import_visits'::text,
    case when n_visits < 0 then 'テーブルがありません' else n_visits || ' 行' end,
    case when n_visits < 0 then '✗ 01_setup.sql が未実行'
         when n_visits = 0 then '✗ CSVが入っていません'
         else '○' end;
  return query select '① 取込テーブル import_visit_items'::text,
    case when n_items < 0 then 'テーブルがありません' else n_items || ' 行' end,
    case when n_items < 0 then '✗ 01_setup.sql が未実行'
         when n_items = 0 then '✗ CSVが入っていません'
         else '○' end;

  ---------------------------------------------------------------
  -- ② 変換関数があるか
  ---------------------------------------------------------------
  return query select '② 変換関数 import_karutekun()'::text,
    case when exists (select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
                      where ns.nspname = 'public' and p.proname = 'import_karutekun')
         then 'あり' else 'なし' end,
    case when exists (select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
                      where ns.nspname = 'public' and p.proname = 'import_karutekun')
         then '○' else '✗ 01_setup.sql が未実行' end;

  ---------------------------------------------------------------
  -- ③ 本番テーブルに入っているか（ここが0なら変換が未実行）
  --    023 未実行だと karte_no 列そのものが無いため、列の有無から確認する
  ---------------------------------------------------------------
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'customers'
                   and column_name = 'karte_no') then
    return query select '③ 取り込み済みの顧客'::text, '列 karte_no がありません'::text,
      '✗ 01_setup.sql が未実行です。ここから始めてください'::text;
    return;
  end if;

  execute 'select count(*) from public.customers where karte_no is not null' into n_cust;
  execute 'select count(*) from public.visits    where karte_visit_no is not null' into n_visit;

  return query select '③ 取り込み済みの顧客'::text, n_cust || ' 件',
    case when n_cust = 0 then '✗ 99_run_import.sql（変換）が未実行の可能性' else '○' end;
  return query select '③ 取り込み済みのカルテ'::text, n_visit || ' 件',
    case when n_visit = 0 then '✗ 変換が未実行の可能性' else '○' end;
  execute 'select coalesce(max(imported_at)::text, ''(なし)'') from public.customers' into v_txt;
  return query select '③ 最後に取り込んだ日時'::text, v_txt, ''::text;

  ---------------------------------------------------------------
  -- ④ 店舗マスタとサロン名の対応（ここがズレると画面に出ない）
  ---------------------------------------------------------------
  select string_agg(code || '=' || name, ' / ' order by code) into v_txt from public.stores;
  return query select '④ stores マスタ'::text, coalesce(v_txt, '(空)'),
    case when v_txt is null then '✗ 店舗マスタが空です' else '○' end;

  if n_karte > 0 then
    execute $q$ select string_agg(distinct "サロン名", ' / ') from public.import_karte $q$ into v_txt;
    return query select '④ CSVのサロン名'::text, coalesce(v_txt, '(なし)'), '';
  end if;

  ---------------------------------------------------------------
  -- ⑤ 取り込んだ顧客の店舗別内訳
  --    アプリの「お客様」画面は主担当店舗で絞り込むため、
  --    画面右上の店舗切替がここに出ない店舗だと0件に見える
  ---------------------------------------------------------------
  if n_cust > 0 then
    select string_agg(t.nm || ' ' || t.cnt || '件', ' / ' order by t.nm) into v_txt
    from (
      select coalesce(s.name, '(店舗未設定)') as nm, count(*) as cnt
      from public.customers c
      left join public.stores s on s.id = c.primary_store_id
      where c.karte_no is not null
      group by 1
    ) t;
    return query select '⑤ 顧客の店舗別内訳'::text, coalesce(v_txt, '(なし)'),
      '← アプリ右上の店舗切替をこの店舗に合わせてください';

    execute 'select count(*) from public.customers where karte_no is not null and primary_store_id is null' into n_cust;
    if n_cust > 0 then
      return query select '⑤ 主担当店舗が未設定の顧客'::text, n_cust || ' 件',
        '✗ この顧客は店舗を選ぶと画面に出ません';
    end if;
  end if;

  ---------------------------------------------------------------
  -- ⑥ アプリから見えるか（RLS）
  ---------------------------------------------------------------
  return query select '⑥ ログイン中のスタッフ'::text,
    coalesce((select s.name || '（' || s.role || '、' ||
                     case when s.is_active then '在籍' else '退職扱い' end || '）'
              from public.staff s where s.id = public.current_staff_id()),
             '(SQL Editor から実行中のため判定なし)'), '';
  return query select '⑥ staff テーブルの在籍者数'::text,
    (select count(*)::text from public.staff where is_active),
    case when (select count(*) from public.staff where is_active) = 0
         then '✗ 在籍スタッフが0人だとアプリから何も見えません' else '○' end;
end;
$$;

select * from public.kk_diag();
