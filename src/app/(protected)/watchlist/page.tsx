import { redirect } from "next/navigation";

export default function WatchlistPage() {
  redirect("/dashboard?filter=watching");
}
