import { Building2, User } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { AccountType } from "@/lib/auth/auth-context";

export function AccountTypeToggle({
  value,
  onChange,
}: {
  value: AccountType;
  onChange: (value: AccountType) => void;
}) {
  return (
    <div className="flex gap-2 rounded-full border border-border bg-secondary/60 p-1">
      <Button
        type="button"
        variant="chip"
        data-active={value === "personal"}
        className="flex-1 justify-center gap-1.5 rounded-full border-0"
        onClick={() => onChange("personal")}
      >
        <User className="size-3.5" /> For me
      </Button>
      <Button
        type="button"
        variant="chip"
        data-active={value === "business"}
        className="flex-1 justify-center gap-1.5 rounded-full border-0"
        onClick={() => onChange("business")}
      >
        <Building2 className="size-3.5" /> Restaurant / Business
      </Button>
    </div>
  );
}
