import { NavLink } from "react-router-dom";

const links = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/portfolio", label: "Portfolio" },
  { to: "/transactions", label: "Transactions" },
];

export default function Sidebar() {
  return (
    <nav className="w-56 border-r border-gray-200 p-4">
      {links.map(({ to, label, end }) => (
        <NavLink
          to={to}
          end={end}
          className={({ isActive }) =>
            `block rounded px-3 py-2 text-sm font-medium ${
              isActive
                ? "bg-gray-900 text-white"
                : "text-gray-600 hover:bg-gray-100"
            }`
          }
        >
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
