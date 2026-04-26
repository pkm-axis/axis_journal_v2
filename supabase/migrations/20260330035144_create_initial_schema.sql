create extension if not exists pgcrypto;

create schema if not exists trading;
create schema if not exists analytics;

create table trading.accounts (
    id uuid primary key default gen_random_uuid(),

    user_id uuid not null references auth.users(id) on delete cascade,

    name text not null,
    account_type text, -- demo, live, funded, prop firm

    currency text default 'USD',
    starting_balance numeric,

    platform text,

    prop_firm_name text,
    prop_firm_type text,
    prop_firm_profit_target numeric,
    prop_firm_max_drawdown numeric,
    prop_firm_daily_loss_limit numeric,
    prop_firm_consistency_rule text,
    prop_firm_max_contracts text,

    created_at timestamptz default now(),
    updated_at timestamptz default now(),

    constraint prop_firm_fields_check check (
        account_type = 'prop firm'
        or (
            prop_firm_name is null and
            prop_firm_type is null and
            prop_firm_profit_target is null and
            prop_firm_max_drawdown is null and
            prop_firm_daily_loss_limit is null and
            prop_firm_consistency_rule is null and
            prop_firm_max_contracts is null
        )
    )
);

create table trading.instruments (
    id uuid primary key default gen_random_uuid(),

    -- Identity
    symbol text not null, -- e.g. NQ, MNQ, BTCUSDT
    exchange text not null, -- e.g. CME, BINANCE
    market_type text not null check (market_type in ('futures', 'perpetual')),

    -- Asset structure
    base_currency text not null, -- e.g. BTC, ETH, NQ
    quote_currency text not null, -- e.g. USD, USDT

    -- Contract details
    contract_size numeric(20,10) not null,   -- e.g. 20 for NQ, 0.001 BTC for crypto
    tick_size numeric(20,10) not null check (tick_size > 0),
    tick_value numeric(20,10) not null check (tick_value > 0),

    -- Futures-specific
    expiry_date date null, -- NULL for perpetuals

    -- Trading parameters
    max_leverage numeric(10,2) null check (max_leverage > 0),

    -- Metadata
    is_active boolean not null default true,
    created_at timestamptz not null default now(),

    -- Uniqueness
    constraint instruments_unique unique (symbol, exchange, market_type, expiry_date)
);

create table trading.trades (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid references trading.accounts(id) on delete cascade,
  instrument_id uuid references trading.instruments(id),

  symbol text not null,
  market text,

  side text check (side in ('long','short')),

  entry_price numeric not null,
  exit_price numeric,
  quantity numeric not null,

  stop_loss numeric,
  take_profit numeric,

  risk numeric,              -- stored (important)
  pnl numeric,               -- computed OR backend
  r_multiple numeric,        -- stored

  status text check (status in ('open','closed')) default 'open',

  opened_at timestamptz not null,
  closed_at timestamptz,

  duration_seconds int,

  notes text,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table trading.strategies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,

  name text not null,
  description text,

  created_at timestamptz default now(),

  unique(user_id, name)
);

create table trading.mistakes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,

  name text not null,
  description text,

  created_at timestamptz default now(),

  unique(user_id, name)
);

create table trading.trade_strategies (
  trade_id uuid references trading.trades(id) on delete cascade,
  strategy_id uuid references trading.strategies(id) on delete cascade,

  primary key (trade_id, strategy_id)
);

create table trading.trade_mistakes (
  trade_id uuid references trading.trades(id) on delete cascade,
  mistake_id uuid references trading.mistakes(id) on delete cascade,

  primary key (trade_id, mistake_id)
);

create table trading.trade_images (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid references trading.trades(id) on delete cascade,

  path text not null,
  type text, -- before, after, execution

  created_at timestamptz default now()
);

create table trading.trade_plans (
  id uuid primary key default gen_random_uuid(),
  trade_id uuid references trading.trades(id) on delete cascade,

  planned_entry numeric,
  planned_stop numeric,
  planned_target numeric,
  planned_rr numeric,

  notes text
);

alter table trading.accounts enable row level security;

create policy "Users can insert their own accounts"
on trading.accounts
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can view their own accounts"
on trading.accounts
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can update their own accounts"
on trading.accounts
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

alter table trading.trades enable row level security;

create policy "Users can insert trades on their accounts"
on trading.trades
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can view trades on their accounts"
on trading.trades
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can update trades on their accounts"
on trading.trades
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete trades on their accounts"
on trading.trades
for delete
to authenticated
using ((select auth.uid()) = user_id);

alter table trading.strategies enable row level security;
alter table trading.mistakes enable row level security;
alter table trading.trade_strategies enable row level security;
alter table trading.trade_mistakes enable row level security;
-- alter table trading.trade_images enable row level security;
-- alter table trading.trade_plans enable row level security;

create policy "Users manage strategies"
on trading.strategies
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users manage mistakes"
on trading.mistakes
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users manage trade_strategies"
on trading.trade_strategies
for all
to authenticated
using (
  exists (
    select 1 from trading.trades t
    where t.id = trade_strategies.trade_id
    and t.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from trading.trades t
    where t.id = trade_strategies.trade_id
    and t.user_id = (select auth.uid())
  )
);

create policy "Users manage trade_mistakes"
on trading.trade_mistakes
for all
to authenticated
using (
  exists (
    select 1 from trading.trades t
    where t.id = trade_mistakes.trade_id
    and t.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from trading.trades t
    where t.id = trade_mistakes.trade_id
    and t.user_id = (select auth.uid())
  )
);

-- create policy "Users manage trade_images"
-- on trading.trade_images
-- for all
-- using (
--   exists (
--     select 1 from trading.trades t
--     where t.id = trade_images.trade_id
--     and t.user_id = auth.uid()
--   )
-- );

-- create policy "Users manage trade_plans"
-- on trading.trade_plans
-- for all
-- using (
--   exists (
--     select 1 from trading.trades t
--     where t.id = trade_plans.trade_id
--     and t.user_id = auth.uid()
--   )
-- );

-- create view analytics.account_performance as
-- select
--   account_id,
--   user_id,
--   count(*) as total_trades,
--   sum(pnl) as total_pnl,
--   avg(r_multiple) as avg_r,
--   avg(case when pnl > 0 then 1 else 0 end)::float as win_rate
-- from trading.trades
-- where status = 'closed'
-- group by account_id, user_id;

-- create view analytics.strategy_performance as
-- select
--   ts.strategy_id,
--   t.user_id,
--   count(*) as total_trades,
--   sum(t.pnl) as total_pnl,
--   avg(t.r_multiple) as avg_r
-- from trading.trade_strategies ts
-- join trading.trades t on t.id = ts.trade_id
-- where t.status = 'closed'
-- group by ts.strategy_id, t.user_id;

