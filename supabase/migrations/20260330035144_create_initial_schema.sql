create schema if not exists app;
create schema if not exists trading;
create schema if not exists analytics;

create table app.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  created_at timestamptz default now()
);

create table trading.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app.profiles(id) on delete cascade,

  name text not null,
  type text, -- demo, live, funded
  currency text default 'USD',

  starting_balance numeric,

  created_at timestamptz default now()
);

create table trading.instruments (
  id uuid primary key default gen_random_uuid(),

  symbol text not null, -- BTCUSDT, EURUSD, ES
  market_type text not null, -- crypto, forex, futures

  quote_currency text default 'USD',

  price_step numeric not null,         -- e.g. 0.0001, 1
  value_per_step numeric not null,     -- $ per step

  contract_multiplier numeric,         -- futures
  default_leverage numeric,

  created_at timestamptz default now(),

  unique(symbol, market_type)
);

create table trading.trades (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references app.profiles(id) on delete cascade,
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
  user_id uuid references app.profiles(id) on delete cascade,

  name text not null,
  description text,

  created_at timestamptz default now(),

  unique(user_id, name)
);

create table trading.mistakes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app.profiles(id) on delete cascade,

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

create index idx_trades_user on trading.trades(user_id);
create index idx_trades_account on trading.trades(account_id);
create index idx_trades_instrument on trading.trades(instrument_id);
create index idx_trades_opened on trading.trades(opened_at);
create index idx_trades_status on trading.trades(status);

create index idx_trade_strategies_trade on trading.trade_strategies(trade_id);
create index idx_trade_mistakes_trade on trading.trade_mistakes(trade_id);

create or replace function app.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_trades_updated_at
before update on trading.trades
for each row
execute function app.update_updated_at_column();

alter table app.profiles enable row level security;
alter table trading.accounts enable row level security;
alter table trading.trades enable row level security;
alter table trading.strategies enable row level security;
alter table trading.mistakes enable row level security;
alter table trading.trade_strategies enable row level security;
alter table trading.trade_mistakes enable row level security;
alter table trading.trade_images enable row level security;
alter table trading.trade_plans enable row level security;

create policy "Users can manage own profile"
on app.profiles
for all
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "Users manage accounts"
on trading.accounts
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users manage trades"
on trading.trades
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users manage strategies"
on trading.strategies
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users manage mistakes"
on trading.mistakes
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users manage trade_strategies"
on trading.trade_strategies
for all
using (
  exists (
    select 1 from trading.trades t
    where t.id = trade_strategies.trade_id
    and t.user_id = auth.uid()
  )
);

create policy "Users manage trade_mistakes"
on trading.trade_mistakes
for all
using (
  exists (
    select 1 from trading.trades t
    where t.id = trade_mistakes.trade_id
    and t.user_id = auth.uid()
  )
);

create policy "Users manage trade_images"
on trading.trade_images
for all
using (
  exists (
    select 1 from trading.trades t
    where t.id = trade_images.trade_id
    and t.user_id = auth.uid()
  )
);

create policy "Users manage trade_plans"
on trading.trade_plans
for all
using (
  exists (
    select 1 from trading.trades t
    where t.id = trade_plans.trade_id
    and t.user_id = auth.uid()
  )
);

create view analytics.account_performance as
select
  account_id,
  user_id,
  count(*) as total_trades,
  sum(pnl) as total_pnl,
  avg(r_multiple) as avg_r,
  avg(case when pnl > 0 then 1 else 0 end)::float as win_rate
from trading.trades
where status = 'closed'
group by account_id, user_id;

create view analytics.strategy_performance as
select
  ts.strategy_id,
  t.user_id,
  count(*) as total_trades,
  sum(t.pnl) as total_pnl,
  avg(t.r_multiple) as avg_r
from trading.trade_strategies ts
join trading.trades t on t.id = ts.trade_id
where t.status = 'closed'
group by ts.strategy_id, t.user_id;

