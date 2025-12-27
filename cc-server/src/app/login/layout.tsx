export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Login page has its own minimal layout (no nav, no footer)
  return <>{children}</>;
}
