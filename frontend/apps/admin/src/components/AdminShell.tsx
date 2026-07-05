import { Link, Outlet, useNavigate } from "@tanstack/react-router";
import { clearToken, isAuthenticated } from "../lib/auth";
import { IconActivity, IconBell, IconCreditCard, IconGrid, IconLogOut, IconSliders, IconTerminal, IconUsers } from "./Icons";

const NAV = [
  { to: "/dashboard",     label: "Dashboard",     icon: <IconGrid /> },
  { to: "/users",         label: "Users",          icon: <IconUsers /> },
  { to: "/subscriptions", label: "Subscriptions",  icon: <IconCreditCard /> },
  { to: "/alerts",        label: "Alerts",         icon: <IconBell /> },
  { to: "/remote-config", label: "Remote Config",  icon: <IconSliders /> },
  { to: "/ops",           label: "Operations",     icon: <IconTerminal /> },
  { to: "/performance",   label: "Performance",    icon: <IconActivity /> },
] as const;

export function AdminShell() {
  const navigate = useNavigate();

  function handleSignOut() {
    clearToken();
    void navigate({ to: "/login" });
  }

  if (!isAuthenticated()) {
    return <Outlet />;
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-brand-dot" />
          MONY<span>SA</span>&nbsp;ADMIN
        </div>
        <nav>
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="nav-link"
              activeProps={{ "data-status": "active" } as never}
            >
              <span className="nav-icon">{n.icon}</span>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button className="sidebar-signout" onClick={handleSignOut}>
            <IconLogOut size={13} />
            Sign out
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
