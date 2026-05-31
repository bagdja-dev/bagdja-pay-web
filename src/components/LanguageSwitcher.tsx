"use client";

import { useState, useRef, useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Language } from "../lib/translations";

const languageOptions: Array<{ code: Language; label: string; flag: string }> = [
  { code: "id", label: "Bahasa Indonesia", flag: "🇮🇩" },
  { code: "en", label: "English", flag: "🇺🇸" },
  { code: "zh", label: "中文", flag: "🇨🇳" },
  { code: "es", label: "Español", flag: "🇪🇸" },
  { code: "ar", label: "العربية", flag: "🇸🇦" },
];

export function LanguageSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentLang = (searchParams.get("lang") || "id") as Language;
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentOption = languageOptions.find((opt) => opt.code === currentLang) || languageOptions[0];

  const changeLanguage = (lang: Language) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("lang", lang);
    // Preserve ALL query params
    router.push(`${pathname}?${params.toString()}`);
    setIsOpen(false);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [isOpen]);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center cursor-pointer gap-1 px-2 py-2 rounded-lg text-sm font-medium text-gray-300 hover:bg-secondary-100 hover:text-white transition border border-gray-300 bg-primary"
      >
        <span className="text-xl">{currentOption.flag}</span>
        <svg
          className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-auto bg-primary rounded-lg shadow-lg border border-gray-200 py-1 z-50">
          {languageOptions.map((option) => (
            <button
              key={option.code}
              onClick={() => changeLanguage(option.code)}
              className={`flex items-center justify-center px-3 py-2 text-sm transition cursor-pointer ${
                currentLang === option.code
                  ? "bg-[#e5a044] text-white font-medium"
                  : "text-gray-300"
              }`}
            >
              <span className="text-xl">{option.flag}</span>
              {currentLang === option.code && (
                <svg
                  className="w-4 h-4 ml-2 text-white"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
