"use client";

// Versões sob demanda dos gráficos: o código do recharts só baixa quando um gráfico aparece.
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ds";

const load = () => import("@/components/fin/fin-charts");
const ph = () => <Skeleton className="h-full min-h-[180px] w-full" />;

export const CashflowChart = dynamic(() => load().then((m) => m.CashflowChart), { ssr: false, loading: ph });
export const DonutChart = dynamic(() => load().then((m) => m.DonutChart), { ssr: false, loading: ph });
export const StackedChart = dynamic(() => load().then((m) => m.StackedChart), { ssr: false, loading: ph });
export const PaceChart = dynamic(() => load().then((m) => m.PaceChart), { ssr: false, loading: ph });
export const ProjectionChart = dynamic(() => load().then((m) => m.ProjectionChart), { ssr: false, loading: ph });
export const SimpleBars = dynamic(() => load().then((m) => m.SimpleBars), { ssr: false, loading: ph });
export const TrendLine = dynamic(() => load().then((m) => m.TrendLine), { ssr: false, loading: ph });
