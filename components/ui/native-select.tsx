import * as React from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select";
import { cn } from "../../lib/utils";

type NativeSelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

type ParsedOption = {
  disabled?: boolean;
  label: React.ReactNode;
  value: string;
};

function getOptionLabel(children: React.ReactNode): string | undefined {
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  if (Array.isArray(children)) {
    const joined = children
      .map((child) => getOptionLabel(child))
      .filter((value): value is string => Boolean(value))
      .join(" ");
    return joined || undefined;
  }
  return undefined;
}

function parseOptions(children: React.ReactNode): ParsedOption[] {
  return React.Children.toArray(children).flatMap((child) => {
    if (!React.isValidElement(child) || child.type !== "option") return [];

    const value = typeof child.props.value === "string" ? child.props.value : String(child.props.value ?? "");
    return [
      {
        value,
        label: child.props.children,
        disabled: Boolean(child.props.disabled),
      },
    ];
  });
}

const NativeSelect = React.forwardRef<HTMLSelectElement, NativeSelectProps>(({ className, children, value, defaultValue, onChange, disabled, name, ...props }, ref) => {
  const options = React.useMemo(() => parseOptions(children), [children]);
  const initialValue = React.useMemo(() => {
    if (typeof defaultValue === "string") return defaultValue;
    if (typeof value === "string") return value;
    return options.find((option) => !option.disabled)?.value ?? "";
  }, [defaultValue, options, value]);

  const [uncontrolledValue, setUncontrolledValue] = React.useState(initialValue);
  const isControlled = typeof value === "string";
  const currentValue = isControlled ? value : uncontrolledValue;
  const selectedLabel = options.find((option) => option.value === currentValue)?.label;

  const emitChange = (nextValue: string) => {
    if (!isControlled) setUncontrolledValue(nextValue);
    if (!onChange) return;

    const syntheticEvent = {
      target: { value: nextValue, name },
      currentTarget: { value: nextValue, name },
    } as React.ChangeEvent<HTMLSelectElement>;

    onChange(syntheticEvent);
  };

  return (
    <div className="min-w-0">
      <select
        ref={ref}
        className="hidden"
        value={currentValue}
        disabled={disabled}
        name={name}
        tabIndex={-1}
        aria-hidden="true"
        onChange={() => {}}
        {...(props.id ? { id: props.id } : {})}
      >
        {children}
      </select>
      <Select value={currentValue} onValueChange={emitChange} disabled={disabled}>
        <SelectTrigger
          className={cn(className)}
          aria-label={props["aria-label"]}
          aria-labelledby={props["aria-labelledby"]}
        >
          <SelectValue placeholder={getOptionLabel(selectedLabel) ?? "Выберите значение"} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
});

NativeSelect.displayName = "NativeSelect";

export { NativeSelect };
