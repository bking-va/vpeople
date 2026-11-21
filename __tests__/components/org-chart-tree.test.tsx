import { fireEvent, render, screen } from "@testing-library/react";
import { OrgChartTree } from "@/components/org-chart-tree";
import { buildOrgChart, type OrgChartEmployee } from "@/lib/org-chart";

jest.mock("next/link", () => {
  return ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>;
});

function emp(
  partial: Partial<OrgChartEmployee> & Pick<OrgChartEmployee, "id">
): OrgChartEmployee {
  return {
    firstName: "Person",
    lastName: `N${partial.id}`,
    preferredName: null,
    jobTitle: "Engineer",
    email: `e${partial.id}@vendasta.com`,
    employeeNumber: String(partial.id),
    managerId: null,
    employmentStatus: "full_time",
    ...partial,
  };
}

describe("OrgChartTree", () => {
  it("shows the CEO first and keeps deeper reports collapsed by default", () => {
    const forest = buildOrgChart([
      emp({
        id: 1,
        firstName: "Apex",
        lastName: "Leader",
        jobTitle: "Chief Executive Officer",
      }),
      emp({
        id: 2,
        firstName: "Vice",
        lastName: "President",
        jobTitle: "VP",
        managerId: 1,
      }),
      emp({
        id: 3,
        firstName: "Deep",
        lastName: "Report",
        jobTitle: "IC",
        managerId: 2,
      }),
    ]);

    render(<OrgChartTree forest={forest} />);

    const names = screen.getAllByRole("heading", { level: 3 }).map((el) => el.textContent);
    expect(names[0]).toBe("Apex Leader");
    expect(screen.getByText("Vice President")).toBeInTheDocument();
    expect(screen.queryByText("Deep Report")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /expand vice president/i }));
    expect(screen.getByText("Deep Report")).toBeInTheDocument();
  });

  it("labels people whose chain does not reach the CEO", () => {
    const forest = buildOrgChart([
      emp({
        id: 1,
        firstName: "Apex",
        lastName: "Leader",
        jobTitle: "Chief Executive Officer",
      }),
      emp({
        id: 8,
        firstName: "No",
        lastName: "Manager",
        jobTitle: "Specialist",
        managerId: null,
      }),
    ]);

    render(<OrgChartTree forest={forest} />);

    expect(screen.getByRole("heading", { name: "No manager in vPeople" })).toBeInTheDocument();
    expect(screen.getByText("No Manager")).toBeInTheDocument();
    expect(screen.getByText("No manager")).toBeInTheDocument();
  });
});
