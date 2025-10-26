-- Enable uuid extension
create extension if not exists "uuid-ossp";

-- Organizations & membership
create table if not exists orgs (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  created_at timestamptz default now()
);

create table if not exists org_members (
  org_id uuid references orgs(id) on delete cascade,
  user_id uuid not null,
  role text not null default 'member',
  primary key (org_id, user_id),
  created_at timestamptz default now()
);

-- Settings (per org)
create table if not exists settings (
  org_id uuid primary key references orgs(id) on delete cascade,
  currency text default '€',
  prefix_enabled boolean default false,
  prefix_text text default 'IS',
  prefix_compact boolean default false
);

-- Categories
create table if not exists categories (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references orgs(id) on delete cascade,
  code text not null,
  name text not null,
  notes text,
  created_at timestamptz default now()
);

-- Products
create table if not exists products (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references orgs(id) on delete cascade,
  code text not null,
  category_code text not null,
  product_index int not null,
  name text not null,
  description text,
  supplier text,
  image_url text,
  cost numeric default 0,
  avg_cost numeric default 0,
  price numeric default 0,
  stock numeric default 0,
  low_stock numeric default 0,
  active boolean default true,
  created_at timestamptz default now()
);

-- Transactions
create table if not exists txns (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references orgs(id) on delete cascade,
  ts timestamptz default now(),
  type text not null check (type in ('purchase','sale','adjust')),
  product_code text not null,
  product_name text,
  category_code text,
  qty numeric not null,
  unit_cost numeric,
  unit_price numeric,
  note text
);

-- Indexes
create index if not exists idx_products_org on products(org_id);
create index if not exists idx_categories_org on categories(org_id);
create index if not exists idx_txns_org on txns(org_id);

-- RLS
alter table orgs enable row level security;
alter table org_members enable row level security;
alter table settings enable row level security;
alter table categories enable row level security;
alter table products enable row level security;
alter table txns enable row level security;

-- Helper function to check membership
create or replace function is_member(o uuid) returns boolean
language sql stable as $$
  select exists (select 1 from org_members where org_id = o and user_id = auth.uid());
$$;

-- Policies
create policy "orgs readable if member" on orgs for select using (is_member(id));
create policy "orgs insert via function only" on orgs for insert with check (false);

create policy "members by self" on org_members
  for select using (user_id = auth.uid());

create policy "settings by member" on settings
  for select using (is_member(org_id))
  with check (is_member(org_id));
create policy "settings update by member" on settings for update using (is_member(org_id)) with check (is_member(org_id));

create policy "categories by member" on categories
  for all using (is_member(org_id)) with check (is_member(org_id));

create policy "products by member" on products
  for all using (is_member(org_id)) with check (is_member(org_id));

create policy "txns by member" on txns
  for all using (is_member(org_id)) with check (is_member(org_id));

-- Function to create org & add current user as admin
create or replace function create_org(org_name text)
returns uuid
language plpgsql security definer as $$
declare oid uuid;
begin
  insert into orgs(name) values (org_name) returning id into oid;
  insert into org_members(org_id, user_id, role) values (oid, auth.uid(), 'admin');
  insert into settings(org_id) values (oid);
  return oid;
end;
$$;