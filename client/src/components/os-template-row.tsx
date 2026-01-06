import { useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { getOsLogoUrl, FALLBACK_LOGO, type OsTemplate } from "@/lib/os-logos";

interface OsTemplateRowProps {
  template: OsTemplate;
  isSelected: boolean;
  onSelect: () => void;
}

export function OsTemplateRow({ template, isSelected, onSelect }: OsTemplateRowProps) {
  const [imgError, setImgError] = useState(false);
  const logoUrl = imgError ? FALLBACK_LOGO : getOsLogoUrl(template);

  const displayName = [
    template.name,
    template.version,
    template.variant ? `(${template.variant})` : null,
  ].filter(Boolean).join(' ');

  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-left",
        "hover:bg-white/10 hover:border-white/20",
        isSelected
          ? "bg-primary/20 border-primary ring-1 ring-primary/50"
          : "bg-white/5 border-white/10"
      )}
      data-testid={`button-os-${template.id}`}
    >
      <img
        src={logoUrl}
        alt={template.name}
        loading="lazy"
        onError={() => setImgError(true)}
        className="w-7 h-7 object-contain flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        <div className="font-medium text-white text-sm truncate">
          {displayName}
        </div>
        {template.description && (
          <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
            {template.description}
          </div>
        )}
      </div>
      {isSelected && (
        <div className="flex-shrink-0 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
          <Check className="w-3 h-3 text-white" />
        </div>
      )}
    </button>
  );
}
