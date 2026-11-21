"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ORG_CHART_DEFAULT_EXPANDED_DEPTH,
  orphanReasonLabel,
  type OrgChartForest,
  type OrgChartNode,
} from "@/lib/org-chart";

function collectExpandedIds(node: OrgChartNode | null, maxDepth: number, depth = 0): number[] {
  if (!node || depth >= maxDepth || node.children.length === 0) return [];
  return [
    node.id,
    ...node.children.flatMap((child) =>
      collectExpandedIds(child, maxDepth, depth + 1)
    ),
  ];
}

function collectExpandableIds(node: OrgChartNode | null): number[] {
  if (!node) return [];
  const mine = node.children.length > 0 ? [node.id] : [];
  return [...mine, ...node.children.flatMap(collectExpandableIds)];
}

export function OrgChartTree({
  forest,
  defaultExpandedDepth = ORG_CHART_DEFAULT_EXPANDED_DEPTH,
}: {
  forest: OrgChartForest;
  defaultExpandedDepth?: number;
}) {
  const defaultExpanded = useMemo(() => {
    return new Set(collectExpandedIds(forest.ceo, defaultExpandedDepth));
  }, [forest.ceo, defaultExpandedDepth]);

  const [expanded, setExpanded] = useState<Set<number>>(defaultExpanded);

  const allExpandable = useMemo(() => {
    const ids = [
      ...collectExpandableIds(forest.ceo),
      ...forest.unmanaged.flatMap(collectExpandableIds),
    ];
    return new Set(ids);
  }, [forest.ceo, forest.unmanaged]);

  const toggle = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setExpanded(new Set(allExpandable))}
        >
          Expand all
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setExpanded(new Set())}
        >
          Collapse all
        </Button>
        <p className="text-sm text-muted-foreground">
          {forest.currentCount} current employee
          {forest.currentCount === 1 ? "" : "s"}
          {forest.unmanagedCount > 0
            ? ` · ${forest.unmanagedCount} not in the CEO line`
            : ""}
        </p>
      </div>

      {forest.ceo ? (
        <OrgNode
          node={forest.ceo}
          expanded={expanded}
          onToggle={toggle}
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          No current employees to show.
        </p>
      )}

      {forest.unmanaged.length > 0 && (
        <section
          aria-label="No manager in vPeople"
          className="rounded-xl border border-amber-200 bg-amber-50/70 p-4"
        >
          <div className="mb-4">
            <h2 className="text-lg font-semibold">No manager in vPeople</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {forest.unmanagedCount} current employee
              {forest.unmanagedCount === 1 ? " is" : "s are"} not in the CEO&apos;s
              reporting line. Their manager is missing, former, or the chain does
              not reach the CEO. Nobody was dropped or assigned a manager.
            </p>
          </div>
          <div className="space-y-4">
            {forest.unmanaged.map((node) => (
              <OrgNode
                key={node.id}
                node={node}
                expanded={expanded}
                onToggle={toggle}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function OrgNode({
  node,
  expanded,
  onToggle,
}: {
  node: OrgChartNode;
  expanded: Set<number>;
  onToggle: (id: number) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isOpen = hasChildren && expanded.has(node.id);

  return (
    <div className="relative">
      <div className="mb-4 flex items-start gap-2">
        {hasChildren ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="mt-3 h-8 w-8 shrink-0"
            aria-expanded={isOpen}
            aria-label={
              isOpen
                ? `Collapse ${node.name}`
                : `Expand ${node.name}, ${node.children.length} direct report${
                    node.children.length === 1 ? "" : "s"
                  }`
            }
            onClick={() => onToggle(node.id)}
          >
            {isOpen ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </Button>
        ) : (
          <span className="mt-3 inline-block h-8 w-8 shrink-0" />
        )}

        <Link href={`/people/${node.id}`} className="min-w-0 flex-1 max-w-lg">
          <Card className="transition-shadow hover:shadow-md">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-semibold">{node.name}</h3>
                  <p className="text-sm text-muted-foreground">
                    {node.jobTitle || "No title"}
                  </p>
                  {node.email ? (
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {node.email}
                    </p>
                  ) : null}
                  {node.orphanReason ? (
                    <Badge variant="outline" className="mt-2 border-amber-300 bg-white">
                      {orphanReasonLabel(node.orphanReason)}
                    </Badge>
                  ) : null}
                </div>
                {hasChildren && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Users className="h-3 w-3" />
                    {node.children.length}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {isOpen && (
        <div className="ml-8 border-l-2 border-gray-200 pl-4">
          {node.children.map((child) => (
            <OrgNode
              key={child.id}
              node={child}
              expanded={expanded}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}
