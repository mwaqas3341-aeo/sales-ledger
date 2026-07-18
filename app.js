import { supabase } from "./supabaseClient.js";

const root = document.getElementById("root");

let state = {
  session: null,
  profile: null,
  shop: null,
  view: null,
};

// =====================================================================
// BOOTSTRAP
// =====================================================================

async function init() {
  const { data: { session } } = await supabase.auth.getSession();
  state.session = session;
  if (session) await loadProfileAndShop();
  render();

  supabase.auth.onAuthStateChange(async (_event, session) => {
    state.session = session;
    if (session) {
      await loadProfileAndShop();
    } else {
      state.profile = null;
      state.shop = null;
    }
    render();
  });
}

async function loadProfileAndShop() {
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", state.session.user.id)
    .single();

  if (error) {
    console.error(error);
    return;
  }
  state.profile = profile;
  state.view = defaultViewFor(profile.role);

  if (profile.shop_id) {
    const { data: shop } = await supabase
      .from("shops")
      .select("*")
      .eq("id", profile.shop_id)
      .single();
    state.shop = shop || null;
  } else {
    state.shop = null;
  }
}

function defaultViewFor(role) {
  if (role === "developer") return "shops";
  if (role === "owner") return "inventory";
  return "stock"; // salesman
}

// =====================================================================
// RENDER ROOT
// =====================================================================

function render() {
  if (!state.session) {
    renderAuthScreen();
    return;
  }
  if (!state.profile) {
    root.innerHTML = `<div class="auth-screen"><p>Loading your account…</p></div>`;
    return;
  }
  if (state.profile.status === "disabled") {
    renderDisabledScreen();
    return;
  }
  renderAppShell();
}

// =====================================================================
// AUTH SCREEN
// =====================================================================

function renderAuthScreen() {
  root.innerHTML = `
    <div class="auth-screen">
      <div class="auth-card">
        <div class="brand">LEDGER <small>shop inventory</small></div>
        <p class="tagline">Sign in to manage stock, staff, and sales.</p>
        <div class="auth-tabs">
          <button id="tab-signin" class="active">Sign in</button>
          <button id="tab-signup">Create account</button>
        </div>
        <div id="msg-slot"></div>
        <form id="auth-form">
          <input type="email" id="email" placeholder="Email" required />
          <input type="password" id="password" placeholder="Password" required minlength="6" />
          <input type="text" id="username" placeholder="Username" style="display:none" />
          <button type="submit" class="btn btn-primary" id="auth-submit">Sign in</button>
        </form>
      </div>
    </div>
  `;

  let mode = "signin";
  const tabSignin = document.getElementById("tab-signin");
  const tabSignup = document.getElementById("tab-signup");
  const usernameField = document.getElementById("username");
  const submitBtn = document.getElementById("auth-submit");

  tabSignin.onclick = () => {
    mode = "signin";
    tabSignin.classList.add("active");
    tabSignup.classList.remove("active");
    usernameField.style.display = "none";
    submitBtn.textContent = "Sign in";
  };
  tabSignup.onclick = () => {
    mode = "signup";
    tabSignup.classList.add("active");
    tabSignin.classList.remove("active");
    usernameField.style.display = "block";
    submitBtn.textContent = "Create account";
  };

  document.getElementById("auth-form").onsubmit = async (e) => {
    e.preventDefault();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const username = document.getElementById("username").value.trim();
    const msgSlot = document.getElementById("msg-slot");
    msgSlot.innerHTML = "";

    try {
      if (mode === "signup") {
        if (!username) throw new Error("Choose a username.");
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { data: { username } },
        });
        if (error) throw error;
        msgSlot.innerHTML = `<div class="msg success">Account created. Check your email to confirm, then sign in. A developer will assign you to a shop.</div>`;
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      msgSlot.innerHTML = `<div class="msg error">${escapeHtml(err.message)}</div>`;
    }
  };
}

function renderDisabledScreen() {
  root.innerHTML = `
    <div class="auth-screen">
      <div class="auth-card">
        <div class="brand">LEDGER</div>
        <p class="tagline">Your account has been disabled. Contact your shop owner or developer.</p>
        <button class="btn btn-ghost" id="signout">Sign out</button>
      </div>
    </div>
  `;
  document.getElementById("signout").onclick = () => supabase.auth.signOut();
}

// =====================================================================
// APP SHELL
// =====================================================================

function renderAppShell() {
  const role = state.profile.role;

  const navItems = {
    developer: [
      ["shops", "Shops"],
      ["unassigned", "Unassigned users"],
    ],
    owner: [
      ["inventory", "Inventory"],
      ["stock", "Stock in / out"],
      ["staff", "Staff"],
      ["logs", "Transaction logs"],
    ],
    salesman: [
      ["search", "Search stock"],
      ["stock", "Stock in / out"],
    ],
  }[role];

  root.innerHTML = `
    <div class="app-shell">
      <div class="sidebar">
        <div class="brand">LEDGER <small>${escapeHtml(role)}</small></div>
        <div class="nav-group">
          <div class="nav-label">Menu</div>
          ${navItems.map(([key, label]) =>
            `<button class="nav-item ${state.view === key ? "active" : ""}" data-view="${key}">${label}</button>`
          ).join("")}
        </div>
        <div class="sidebar-footer">
          <div class="who">
            ${escapeHtml(state.profile.username)}<br/>
            ${state.shop ? escapeHtml(state.shop.shop_name) : "No shop assigned"}
          </div>
          <button class="link-btn" id="signout">Sign out</button>
        </div>
      </div>
      <div class="main">
        <div class="topbar">
          <h1 id="page-title"></h1>
          ${state.shop ? `<span class="tier-chip ${state.shop.account_tier}">${state.shop.account_tier}</span>` : ""}
        </div>
        <div id="view-slot"></div>
      </div>
    </div>
  `;

  document.getElementById("signout").onclick = () => supabase.auth.signOut();
  root.querySelectorAll(".nav-item").forEach((btn) => {
    btn.onclick = () => {
      state.view = btn.dataset.view;
      renderAppShell();
    };
  });

  renderView();
}

function setTitle(t) {
  document.getElementById("page-title").textContent = t;
}

function renderView() {
  const slot = document.getElementById("view-slot");
  const role = state.profile.role;

  if (role === "developer") {
    if (state.view === "shops") return renderDevShops(slot);
    if (state.view === "unassigned") return renderDevUnassigned(slot);
  }
  if (role === "owner") {
    if (!state.shop) {
      slot.innerHTML = `<div class="card"><p class="sub">Your account has no shop assigned yet. Contact the developer.</p></div>`;
      setTitle("No shop");
      return;
    }
    if (state.view === "inventory") return renderOwnerInventory(slot);
    if (state.view === "stock") return renderStockForm(slot, true);
    if (state.view === "staff") return renderOwnerStaff(slot);
    if (state.view === "logs") return renderOwnerLogs(slot);
  }
  if (role === "salesman") {
    if (!state.shop) {
      slot.innerHTML = `<div class="card"><p class="sub">You haven't been added to a shop yet. Ask your shop owner to add you.</p></div>`;
      setTitle("No shop");
      return;
    }
    if (state.view === "search") return renderSalesmanSearch(slot);
    if (state.view === "stock") return renderStockForm(slot, false);
  }
}

// =====================================================================
// DEVELOPER: SHOPS
// =====================================================================

async function renderDevShops(slot) {
  setTitle("Shops");
  slot.innerHTML = `<div class="card"><p class="sub">Loading…</p></div>`;

  const { data: shops, error } = await supabase.from("shops").select("*").order("created_at", { ascending: false });
  if (error) {
    slot.innerHTML = `<div class="msg error">${escapeHtml(error.message)}</div>`;
    return;
  }

  slot.innerHTML = `
    <div class="card">
      <h2>All shops</h2>
      <p class="sub">Toggle a shop between Free (3 salesmen) and Paid (10 salesmen).</p>
      ${shops.length === 0 ? `<div class="empty-state">No shops yet. Promote a user to owner below.</div>` : ""}
      ${shops.map((s) => `
        <div class="ledger-row">
          <span class="name">${escapeHtml(s.shop_name)}</span>
          <span class="meta">${s.status}</span>
          <span class="filler"></span>
          <span class="tier-chip ${s.account_tier}" style="margin-right:8px">${s.account_tier}</span>
          <button class="btn btn-ghost" data-toggle="${s.id}" data-tier="${s.account_tier === "free" ? "paid" : "free"}">
            Switch to ${s.account_tier === "free" ? "Paid" : "Free"}
          </button>
        </div>
      `).join("")}
    </div>
  `;

  slot.querySelectorAll("[data-toggle]").forEach((btn) => {
    btn.onclick = async () => {
      btn.disabled = true;
      const { error } = await supabase.rpc("set_shop_tier", {
        p_shop_id: btn.dataset.toggle,
        p_tier: btn.dataset.tier,
      });
      if (error) alert(error.message);
      renderDevShops(slot);
    };
  });
}

// =====================================================================
// DEVELOPER: UNASSIGNED USERS -> PROMOTE TO OWNER
// =====================================================================

async function renderDevUnassigned(slot) {
  setTitle("Unassigned users");
  slot.innerHTML = `<div class="card"><p class="sub">Loading…</p></div>`;

  const { data: users, error } = await supabase
    .from("profiles")
    .select("*")
    .is("shop_id", null)
    .neq("role", "developer");

  if (error) {
    slot.innerHTML = `<div class="msg error">${escapeHtml(error.message)}</div>`;
    return;
  }

  slot.innerHTML = `
    <div class="card">
      <h2>Users without a shop</h2>
      <p class="sub">Promote a self-registered user to Shop Owner and create their shop.</p>
      ${users.length === 0 ? `<div class="empty-state">No unassigned users right now.</div>` : ""}
      ${users.map((u) => `
        <div class="ledger-row">
          <span class="name">${escapeHtml(u.username)}</span>
          <span class="filler"></span>
          <div class="actions">
            <input type="text" placeholder="Shop name" id="shopname-${u.id}" style="width:140px" />
            <select id="tier-${u.id}">
              <option value="free">Free</option>
              <option value="paid">Paid</option>
            </select>
            <button class="btn btn-primary" data-promote="${u.id}">Make owner</button>
          </div>
        </div>
      `).join("")}
    </div>
  `;

  slot.querySelectorAll("[data-promote]").forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.dataset.promote;
      const shopName = document.getElementById(`shopname-${id}`).value.trim();
      const tier = document.getElementById(`tier-${id}`).value;
      if (!shopName) { alert("Enter a shop name first."); return; }
      btn.disabled = true;
      const { error } = await supabase.rpc("promote_to_owner", {
        p_user_id: id, p_shop_name: shopName, p_tier: tier,
      });
      if (error) { alert(error.message); btn.disabled = false; return; }
      renderDevUnassigned(slot);
    };
  });
}

// =====================================================================
// OWNER: INVENTORY (full CRUD, sees cost price)
// =====================================================================

async function renderOwnerInventory(slot) {
  setTitle("Inventory");
  slot.innerHTML = `<div class="card"><p class="sub">Loading…</p></div>`;

  const { data: items, error } = await supabase
    .from("inventory")
    .select("*")
    .eq("shop_id", state.shop.id)
    .order("item_name");

  if (error) {
    slot.innerHTML = `<div class="msg error">${escapeHtml(error.message)}</div>`;
    return;
  }

  slot.innerHTML = `
    <div class="card">
      <h2>Add item</h2>
      <form id="add-item-form" class="field-row">
        <input type="text" id="sku" placeholder="SKU" required style="width:100px" />
        <input type="text" id="item_name" placeholder="Item name" required style="width:180px" />
        <input type="text" id="category" placeholder="Category" style="width:120px" />
        <input type="number" id="cost_price" placeholder="Cost price" step="0.01" min="0" required style="width:110px" />
        <input type="number" id="selling_price" placeholder="Selling price" step="0.01" min="0" required style="width:110px" />
        <input type="number" id="stock_level" placeholder="Starting stock" min="0" required style="width:110px" />
        <button type="submit" class="btn btn-primary">Add</button>
      </form>
    </div>
    <div class="card">
      <h2>Current inventory</h2>
      <p class="sub">${items.length} item(s)</p>
      ${items.length === 0 ? `<div class="empty-state">No inventory yet — add your first item above.</div>` : ""}
      ${items.map((it) => {
        const low = it.stock_level <= 5;
        const pct = Math.min(100, it.stock_level * 5);
        return `
        <div class="ledger-row">
          <span class="name">${escapeHtml(it.item_name)}</span>
          <span class="meta">${escapeHtml(it.sku)}${it.category ? " · " + escapeHtml(it.category) : ""}</span>
          <span class="filler"></span>
          <span class="value ${low ? "stock-low" : ""}">${it.stock_level} in stock</span>
          <span class="stock-bar ${low ? "low" : ""}"><span style="width:${pct}%"></span></span>
          <span class="value" style="margin-left:14px">cost $${Number(it.cost_price).toFixed(2)} → sell $${Number(it.selling_price).toFixed(2)}</span>
          <div class="actions" style="margin-left:12px">
            <button class="btn btn-danger" data-delete="${it.id}">Delete</button>
          </div>
        </div>
      `;
      }).join("")}
    </div>
  `;

  document.getElementById("add-item-form").onsubmit = async (e) => {
    e.preventDefault();
    const payload = {
      shop_id: state.shop.id,
      sku: document.getElementById("sku").value.trim(),
      item_name: document.getElementById("item_name").value.trim(),
      category: document.getElementById("category").value.trim() || null,
      cost_price: parseFloat(document.getElementById("cost_price").value),
      selling_price: parseFloat(document.getElementById("selling_price").value),
      stock_level: parseInt(document.getElementById("stock_level").value, 10),
    };
    const { error } = await supabase.from("inventory").insert(payload);
    if (error) { alert(error.message); return; }
    renderOwnerInventory(slot);
  };

  slot.querySelectorAll("[data-delete]").forEach((btn) => {
    btn.onclick = async () => {
      if (!confirm("Delete this item? This cannot be undone.")) return;
      const { error } = await supabase.from("inventory").delete().eq("id", btn.dataset.delete);
      if (error) { alert(error.message); return; }
      renderOwnerInventory(slot);
    };
  });
}

// =====================================================================
// SALESMAN: SEARCH STOCK (cost price hidden — uses the safe view)
// =====================================================================

async function renderSalesmanSearch(slot) {
  setTitle("Search stock");
  slot.innerHTML = `
    <div class="card">
      <div class="field-row">
        <input type="text" id="q" placeholder="Search by item name or SKU…" style="width:260px" />
      </div>
    </div>
    <div class="card"><div id="results"></div></div>
  `;

  const runSearch = async (q) => {
    let query = supabase
      .from("inventory_salesman_view")
      .select("*")
      .eq("shop_id", state.shop.id)
      .order("item_name");
    if (q) query = query.or(`item_name.ilike.%${q}%,sku.ilike.%${q}%`);
    const { data: items, error } = await query;
    const results = document.getElementById("results");
    if (error) { results.innerHTML = `<div class="msg error">${escapeHtml(error.message)}</div>`; return; }
    results.innerHTML = items.length === 0
      ? `<div class="empty-state">No matching items.</div>`
      : items.map((it) => `
        <div class="ledger-row">
          <span class="name">${escapeHtml(it.item_name)}</span>
          <span class="meta">${escapeHtml(it.sku)}</span>
          <span class="filler"></span>
          <span class="value">${it.stock_level} in stock</span>
          <span class="value" style="margin-left:14px">$${Number(it.selling_price).toFixed(2)}</span>
        </div>
      `).join("");
  };

  document.getElementById("q").oninput = (e) => runSearch(e.target.value.trim());
  runSearch("");
}

// =====================================================================
// STOCK IN / OUT FORM (shared by owner + salesman — same RPC)
// =====================================================================

async function renderStockForm(slot, isOwner) {
  setTitle("Stock in / out");
  slot.innerHTML = `<div class="card"><p class="sub">Loading items…</p></div>`;

  const table = isOwner ? "inventory" : "inventory_salesman_view";
  const { data: items, error } = await supabase
    .from(table)
    .select("id, item_name, sku, stock_level")
    .eq("shop_id", state.shop.id)
    .order("item_name");

  if (error) {
    slot.innerHTML = `<div class="msg error">${escapeHtml(error.message)}</div>`;
    return;
  }

  slot.innerHTML = `
    <div class="card">
      <h2>Log a stock movement</h2>
      <p class="sub">Stock-out fails automatically if there isn't enough on hand.</p>
      <div id="msg-slot"></div>
      <form id="stock-form" class="field-row">
        <select id="item_id" required>
          <option value="" disabled selected>Choose item…</option>
          ${items.map((it) => `<option value="${it.id}">${escapeHtml(it.item_name)} (${it.stock_level} on hand)</option>`).join("")}
        </select>
        <select id="action_type">
          <option value="stock_out">Stock-out (sale)</option>
          <option value="stock_in">Stock-in (restock)</option>
        </select>
        <input type="number" id="qty" placeholder="Qty" min="1" required style="width:80px" />
        <button type="submit" class="btn btn-primary">Log it</button>
      </form>
    </div>
  `;

  document.getElementById("stock-form").onsubmit = async (e) => {
    e.preventDefault();
    const msgSlot = document.getElementById("msg-slot");
    msgSlot.innerHTML = "";
    const { error } = await supabase.rpc("adjust_stock", {
      p_item_id: document.getElementById("item_id").value,
      p_action: document.getElementById("action_type").value,
      p_qty: parseInt(document.getElementById("qty").value, 10),
    });
    if (error) {
      msgSlot.innerHTML = `<div class="msg error">${escapeHtml(error.message)}</div>`;
      return;
    }
    msgSlot.innerHTML = `<div class="msg success">Logged.</div>`;
    renderStockForm(slot, isOwner);
  };
}

// =====================================================================
// OWNER: STAFF (unassigned search + claim, current staff enable/disable)
// =====================================================================

async function renderOwnerStaff(slot) {
  setTitle("Staff");
  slot.innerHTML = `<div class="card"><p class="sub">Loading…</p></div>`;

  const [{ data: staff, error: e1 }, { data: unassigned, error: e2 }] = await Promise.all([
    supabase.from("profiles").select("*").eq("shop_id", state.shop.id).eq("role", "salesman"),
    supabase.from("profiles").select("*").is("shop_id", null).eq("role", "salesman"),
  ]);

  if (e1 || e2) {
    slot.innerHTML = `<div class="msg error">${escapeHtml((e1 || e2).message)}</div>`;
    return;
  }

  const limit = state.shop.account_tier === "paid" ? 10 : 3;
  const activeCount = staff.filter((s) => s.status === "active").length;

  slot.innerHTML = `
    <div class="card">
      <h2>Your staff</h2>
      <p class="sub">${activeCount} / ${limit} active salesmen on the ${state.shop.account_tier} plan</p>
      ${staff.length === 0 ? `<div class="empty-state">No salesmen yet.</div>` : ""}
      ${staff.map((s) => `
        <div class="ledger-row">
          <span class="name">${escapeHtml(s.username)}</span>
          <span class="meta">${s.status}</span>
          <span class="filler"></span>
          <button class="btn ${s.status === "active" ? "btn-danger" : "btn-primary"}" data-toggle-status="${s.id}" data-next="${s.status === "active" ? "disabled" : "active"}">
            ${s.status === "active" ? "Disable" : "Re-enable"}
          </button>
        </div>
      `).join("")}
    </div>
    <div class="card">
      <h2>Add staff</h2>
      <p class="sub">Users who have signed up but aren't assigned to a shop yet.</p>
      <div id="claim-msg"></div>
      ${unassigned.length === 0 ? `<div class="empty-state">Nobody waiting right now — ask staff to create an account first.</div>` : ""}
      ${unassigned.map((u) => `
        <div class="ledger-row">
          <span class="name">${escapeHtml(u.username)}</span>
          <span class="filler"></span>
          <button class="btn btn-primary" data-claim="${u.id}" ${activeCount >= limit ? "disabled" : ""}>Add to shop</button>
        </div>
      `).join("")}
      ${activeCount >= limit ? `<div class="msg error" style="margin-top:12px">You're at your ${state.shop.account_tier} plan limit of ${limit}. Ask a developer to upgrade your shop.</div>` : ""}
    </div>
  `;

  slot.querySelectorAll("[data-toggle-status]").forEach((btn) => {
    btn.onclick = async () => {
      const { error } = await supabase
        .from("profiles")
        .update({ status: btn.dataset.next })
        .eq("id", btn.dataset.toggleStatus);
      if (error) { alert(error.message); return; }
      renderOwnerStaff(slot);
    };
  });

  slot.querySelectorAll("[data-claim]").forEach((btn) => {
    btn.onclick = async () => {
      btn.disabled = true;
      const { error } = await supabase
        .from("profiles")
        .update({ shop_id: state.shop.id })
        .eq("id", btn.dataset.claim);
      const claimMsg = document.getElementById("claim-msg");
      if (error) {
        claimMsg.innerHTML = `<div class="msg error">${escapeHtml(error.message)}</div>`;
        btn.disabled = false;
        return;
      }
      renderOwnerStaff(slot);
    };
  });
}

// =====================================================================
// OWNER: TRANSACTION LOGS
// =====================================================================

async function renderOwnerLogs(slot) {
  setTitle("Transaction logs");
  slot.innerHTML = `<div class="card"><p class="sub">Loading…</p></div>`;

  const { data: logs, error } = await supabase
    .from("transaction_logs")
    .select("*, inventory(item_name, sku), profiles(username)")
    .eq("shop_id", state.shop.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    slot.innerHTML = `<div class="msg error">${escapeHtml(error.message)}</div>`;
    return;
  }

  slot.innerHTML = `
    <div class="card">
      <h2>Recent activity</h2>
      <p class="sub">Last ${logs.length} movements</p>
      ${logs.length === 0 ? `<div class="empty-state">No activity yet.</div>` : ""}
      ${logs.map((l) => `
        <div class="ledger-row">
          <span class="name">${escapeHtml(l.inventory?.item_name || "Deleted item")}</span>
          <span class="meta">${escapeHtml(l.profiles?.username || "—")}</span>
          <span class="filler"></span>
          <span class="value ${l.action_type === "stock_out" ? "stock-low" : ""}">${l.action_type === "stock_out" ? "−" : "+"}${l.quantity}</span>
          <span class="meta" style="margin-left:14px">${new Date(l.created_at).toLocaleString()}</span>
        </div>
      `).join("")}
    </div>
  `;
}

// =====================================================================
// UTIL
// =====================================================================

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

init();
