"use client";

interface DataPoint {
  label: string;
  value: number;
}

interface ChartCardProps {
  title: string;
  data: DataPoint[];
  type?: "bar" | "line";
  color?: string;
}

export default function ChartCard({ title, data, type = "bar", color = "hsl(var(--primary))" }: ChartCardProps) {
  const maxValue = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="bg-card rounded-2xl border border-border shadow-sm p-6">
      <h3 className="text-lg font-semibold text-foreground mb-4 font-display italic">{title}</h3>
      <div className="space-y-3">
        {type === "bar" ? (
          data.map((item, index) => (
            <div key={index}>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-muted-foreground">{item.label}</span>
                <span className="font-medium text-foreground">{item.value.toLocaleString()}</span>
              </div>
              <div className="w-full bg-secondary rounded-full h-2">
                <div
                  className="h-2 rounded-full transition-all duration-500"
                  style={{
                    width: `${(item.value / maxValue) * 100}%`,
                    backgroundColor: color,
                  }}
                />
              </div>
            </div>
          ))
        ) : (
          <div className="h-40 flex items-end space-x-2">
            {data.map((item, index) => (
              <div key={index} className="flex-1 flex flex-col items-center">
                <div
                  className="w-full rounded-t transition-all duration-500"
                  style={{
                    height: `${(item.value / maxValue) * 100}%`,
                    minHeight: "4px",
                    backgroundColor: color,
                  }}
                />
                <span className="text-xs text-muted-foreground mt-2 truncate w-full text-center">
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
