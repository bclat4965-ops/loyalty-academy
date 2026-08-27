/* Loyalty Academy frontend
   1) Replace SUPABASE_URL and SUPABASE_ANON_KEY.
   2) Run schema.sql in Supabase SQL Editor.
*/
const SUPABASE_URL = "https://aacxapuousgddxjvnpfl.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFhY3hhcHVvdXNnZGR4anZucGZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2MjYzNjQsImV4cCI6MjEwMzIwMjM2NH0.FRBNADPv8lKnw5dA7WO3kYo_2veC3qbDBVZSn6eGcDU";

let supabaseClient = null;
let authMode = "login";
let selectedRole = "student";
let currentUser = null;
let currentProfile = null;

function configured() {
  return !SUPABASE_URL.startsWith("YOUR_") && !SUPABASE_ANON_KEY.startsWith("YOUR_");
}

function initSupabase() {
  if (!configured()) return;
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  supabaseClient.auth.onAuthStateChange(async (_event, session) => {
    currentUser = session?.user || null;
    if (currentUser) await loadProfile();
    else {
      currentProfile = null;
      renderNav();
      showView("home");
    }
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("year").textContent = new Date().getFullYear();
  initSupabase();
  if (!supabaseClient) {
    renderNav();
    return;
  }
  const { data } = await supabaseClient.auth.getSession();
  currentUser = data.session?.user || null;
  if (currentUser) {
    await loadProfile();
    await showDashboard();
  }
  renderNav();
});

function showView(name) {
  ["homeView","authView","dashboardView"].forEach(id => document.getElementById(id).classList.add("hidden"));
  document.getElementById(name + "View").classList.remove("hidden");
  window.scrollTo({top:0,behavior:"smooth"});
  renderNav();
}

function renderNav() {
  const nav = document.getElementById("nav");
  if (!nav) return;
  if (currentUser) {
    nav.innerHTML = `<button onclick="showDashboard()">Dashboard</button><button onclick="signOut()">Log out</button>`;
  } else {
    nav.innerHTML = `<button onclick="openAuth('login')">Log in</button><button class="primary" onclick="openAuth('signup')">Sign up</button>`;
  }
}

function openAuth(mode="login") {
  authMode = mode;
  document.getElementById("authView").classList.remove("hidden");
  document.getElementById("homeView").classList.add("hidden");
  document.getElementById("dashboardView").classList.add("hidden");
  setAuthMode(mode);
  renderNav();
  window.scrollTo({top:0,behavior:"smooth"});
}

function setAuthMode(mode) {
  authMode = mode;
  document.getElementById("loginTab").classList.toggle("active", mode === "login");
  document.getElementById("signupTab").classList.toggle("active", mode === "signup");
  document.getElementById("nameField").classList.toggle("hidden", mode !== "signup");
  document.getElementById("authSubmit").textContent = mode === "login" ? "Log in" : "Create account";
  document.getElementById("switchPrompt").textContent = mode === "login" ? "Don't have an account?" : "Already have an account?";
  document.querySelector(".link-button").textContent = mode === "login" ? "Sign up" : "Log in";
  document.getElementById("authMessage").textContent = "";
}

function toggleAuthMode() {
  setAuthMode(authMode === "login" ? "signup" : "login");
}

function setRole(role) {
  selectedRole = role;
  document.getElementById("studentRole").classList.toggle("active", role === "student");
  document.getElementById("teacherRole").classList.toggle("active", role === "teacher");
}

async function handleAuth(e) {
  e.preventDefault();
  const msg = document.getElementById("authMessage");
  msg.className = "message";
  if (!supabaseClient) {
    msg.className = "message error";
    msg.textContent = "Connect your Supabase URL and anon key in app.js first.";
    return;
  }

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const fullName = document.getElementById("fullName").value.trim();

  if (authMode === "signup") {
    if (!fullName) return setMessage("Please enter your full name.", true);
const { data, error } = await supabaseClient.auth.signUp({
  email,
  password,
  options: {
    emailRedirectTo: "https://loyalty-academy.vercel.app/",
    data: {
      full_name: fullName,
      requested_role: selectedRole
    }
  }
});
    if (error) return setMessage(error.message, true);

    if (data.session) {
      currentUser = data.user;
      await loadProfile();
      setMessage("Account created. Opening your dashboard...", false);
      setTimeout(showDashboard, 500);
    } else {
      setMessage("Account created. Check your email to confirm your account, then log in.", false);
    }
  } else {
    const { data, error } = await supabaseClient.auth.signInWithPassword({email,password});
    if (error) return setMessage(error.message, true);
    currentUser = data.user;
    await loadProfile();
    showDashboard();
  }
}

function setMessage(text, error=false) {
  const msg = document.getElementById("authMessage");
  msg.textContent = text;
  msg.className = "message " + (error ? "error" : "success");
}

async function loadProfile() {
  if (!supabaseClient || !currentUser) return false;

  const { data, error } = await supabaseClient
    .from("profiles")
    .select("*")
    .eq("id", currentUser.id)
    .maybeSingle();

  if (error) {
    console.error("Profile loading error:", error);
    setMessage("There was a problem loading your account: " + error.message, true);
    return false;
  }

  if (!data) {
    console.error("No profile found for user:", currentUser.id);
    setMessage(
      "Your account was verified, but your student profile has not been created yet.",
      true
    );
    return false;
  }

  currentProfile = data;
  return true;
}
async function showDashboard() {
  if (!currentUser) return openAuth("login");
  if (!currentProfile) await loadProfile();
  if (!currentProfile) return showToast("Your profile is still being created. Please try again.");

  showView("dashboard");
  const isTeacher = ["teacher","admin"].includes(currentProfile.role);
  document.getElementById("dashboardEyebrow").textContent = isTeacher ? "TEACHER PORTAL" : "STUDENT PORTAL";
  document.getElementById("dashboardTitle").textContent = `Welcome, ${currentProfile.full_name || "Learner"}`;
  document.getElementById("dashboardSubtitle").textContent = isTeacher
    ? "Manage classes, assignments and your teaching resources."
    : "View your classes, assignments and learning resources.";

  if (isTeacher) await renderTeacherDashboard();
  else await renderStudentDashboard();
}

async function renderStudentDashboard() {
  const content = document.getElementById("dashboardContent");
  const { data: enrollments } = await supabaseClient
    .from("enrollments")
    .select("class_id, classes(id,name,description,teacher_id,profiles:teacher_id(full_name))")
    .eq("student_id", currentUser.id);

  const classRows = (enrollments || []).map(x => x.classes).filter(Boolean);
  const classIds = classRows.map(c => c.id);

  let assignments = [];
  if (classIds.length) {
    const { data } = await supabaseClient
      .from("assignments")
      .select("id,title,description,due_at,class_id,classes(name)")
      .in("class_id", classIds)
      .order("due_at",{ascending:true});
    assignments = data || [];
  }

  content.innerHTML = `
    <div class="dashboard">
      <div class="stat-grid">
        <div class="stat"><div class="num">${classRows.length}</div><small>Enrolled classes</small></div>
        <div class="stat"><div class="num">${assignments.length}</div><small>Assignments</small></div>
        <div class="stat"><div class="num">${currentProfile.role}</div><small>Account role</small></div>
      </div>
      <div class="panel-grid">
        <div class="panel"><h3>My Classes</h3>
          ${classRows.length ? `<ul class="list">${classRows.map(c=>`<li><strong>${escapeHtml(c.name)}</strong><span>${escapeHtml(c.description || "Class")}${c.profiles?.full_name ? " • Teacher: "+escapeHtml(c.profiles.full_name):""}</span></li>`).join("")}</ul>` : `<div class="empty">You are not enrolled in a class yet.</div>`}
        </div>
        <div class="panel"><h3>Upcoming Assignments</h3>
          ${assignments.length ? `<ul class="list">${assignments.map(a=>`<li><strong>${escapeHtml(a.title)}</strong><span>${escapeHtml(a.classes?.name || "Class")} • ${formatDate(a.due_at)}</span></li>`).join("")}</ul>` : `<div class="empty">No assignments yet.</div>`}
        </div>
      </div>
    </div>`;
}

async function renderTeacherDashboard() {
  const content = document.getElementById("dashboardContent");
  const { data: classes } = await supabaseClient
    .from("classes").select("id,name,description").eq("teacher_id", currentUser.id).order("created_at",{ascending:false});
  const classRows = classes || [];
  const ids = classRows.map(c=>c.id);

  let assignments = [];
  let enrollmentCounts = {};
  if (ids.length) {
    const { data: asg } = await supabaseClient.from("assignments").select("id,title,due_at,class_id,classes(name)").in("class_id",ids).order("due_at",{ascending:true});
    assignments = asg || [];
    const { data: ens } = await supabaseClient.from("enrollments").select("class_id").in("class_id",ids);
    (ens || []).forEach(e => enrollmentCounts[e.class_id] = (enrollmentCounts[e.class_id] || 0) + 1);
  }

  content.innerHTML = `
    <div class="dashboard">
      <div class="stat-grid">
        <div class="stat"><div class="num">${classRows.length}</div><small>My classes</small></div>
        <div class="stat"><div class="num">${assignments.length}</div><small>Assignments</small></div>
        <div class="stat"><div class="num">${Object.values(enrollmentCounts).reduce((a,b)=>a+b,0)}</div><small>Enrolled students</small></div>
      </div>
      <div class="panel-grid">
        <div class="panel"><h3>My Classes</h3>
          ${classRows.length ? `<ul class="list">${classRows.map(c=>`<li><strong>${escapeHtml(c.name)}</strong><span>${escapeHtml(c.description || "No description")} • ${enrollmentCounts[c.id] || 0} students</span></li>`).join("")}</ul>` : `<div class="empty">No classes assigned to you yet.</div>`}
        </div>
        <div class="panel"><h3>Assignments</h3>
          ${assignments.length ? `<ul class="list">${assignments.map(a=>`<li><strong>${escapeHtml(a.title)}</strong><span>${escapeHtml(a.classes?.name || "Class")} • ${formatDate(a.due_at)}</span></li>`).join("")}</ul>` : `<div class="empty">No assignments created yet.</div>`}
        </div>
      </div>
      <div class="panel" style="margin-top:20px"><h3>Teacher tools</h3><p style="color:var(--muted)">Create classes and assignments from the Supabase dashboard or extend this page with teacher forms. The database policies already protect teacher-owned classes and assignments.</p></div>
    </div>`;
}

async function signOut() {
  if (supabaseClient) await supabaseClient.auth.signOut();
  currentUser = null; currentProfile = null;
  showView("home");
  showToast("You have been logged out.");
}

function formatDate(value) {
  if (!value) return "No due date";
  return new Date(value).toLocaleString([], {dateStyle:"medium",timeStyle:"short"});
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}
function showToast(text) {
  const t=document.getElementById("toast"); t.textContent=text; t.classList.add("show");
  setTimeout(()=>t.classList.remove("show"),3000);
}
