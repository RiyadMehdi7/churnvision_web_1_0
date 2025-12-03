#!/usr/bin/env python3
"""
Generate realistic employee churn datasets for testing ChurnVision.

Required columns:
- hr_code: unique HR identifier
- full_name: employee full name
- structure_name: department/structure name
- position: job title
- status: employment status (Active, Terminated)
- manager_id: HR code of the manager (nullable)
- tenure: years at company
- termination_date: date of termination (nullable for active employees)
- employee_cost: annual cost/salary

Additional realistic columns for richer datasets.
"""

import csv
import random
from datetime import datetime, timedelta
from pathlib import Path

# Configuration
STRUCTURES = [
    'Sales', 'Engineering', 'Customer Support', 'IT Operations', 'Product Management',
    'Marketing', 'Research & Development', 'Finance & Accounting', 'Human Resources', 'Executive Management'
]

POSITIONS_BY_STRUCTURE = {
    'Sales': ['Sales Representative', 'Account Executive', 'Sales Manager', 'Regional Sales Director', 'Sales Analyst', 'Business Development Rep'],
    'Engineering': ['Software Engineer', 'Senior Software Engineer', 'Tech Lead', 'Staff Engineer', 'QA Engineer', 'Engineering Manager'],
    'Customer Support': ['Support Specialist', 'Technical Support Agent', 'Customer Success Manager', 'Support Team Lead', 'Escalation Specialist'],
    'IT Operations': ['System Administrator', 'Network Engineer', 'DevOps Engineer', 'IT Specialist', 'Security Analyst', 'IT Manager'],
    'Product Management': ['Product Manager', 'Senior Product Manager', 'Product Owner', 'Product Analyst', 'Associate Product Manager', 'VP of Product'],
    'Marketing': ['Marketing Specialist', 'Content Manager', 'Digital Marketing Manager', 'Brand Manager', 'Marketing Analyst', 'CMO'],
    'Research & Development': ['Research Scientist', 'Data Scientist', 'ML Engineer', 'Research Engineer', 'Principal Scientist', 'R&D Director'],
    'Finance & Accounting': ['Accountant', 'Senior Accountant', 'Financial Analyst', 'Controller', 'Bookkeeper', 'CFO'],
    'Human Resources': ['HR Specialist', 'Recruiter', 'HR Manager', 'Talent Acquisition Lead', 'HR Business Partner', 'CHRO'],
    'Executive Management': ['Director', 'Vice President', 'General Manager', 'Chief of Staff', 'Executive Assistant', 'CEO']
}

FIRST_NAMES_MALE = [
    'James', 'John', 'Robert', 'Michael', 'William', 'David', 'Richard', 'Joseph', 'Thomas', 'Christopher',
    'Charles', 'Daniel', 'Matthew', 'Anthony', 'Mark', 'Donald', 'Steven', 'Paul', 'Andrew', 'Joshua',
    'Kenneth', 'Kevin', 'Brian', 'George', 'Timothy', 'Ronald', 'Edward', 'Jason', 'Jeffrey', 'Ryan',
    'Jacob', 'Gary', 'Nicholas', 'Eric', 'Jonathan', 'Stephen', 'Larry', 'Justin', 'Scott', 'Brandon',
    'Benjamin', 'Samuel', 'Raymond', 'Gregory', 'Frank', 'Alexander', 'Patrick', 'Jack', 'Dennis', 'Jerry'
]

FIRST_NAMES_FEMALE = [
    'Mary', 'Patricia', 'Jennifer', 'Linda', 'Elizabeth', 'Barbara', 'Susan', 'Jessica', 'Sarah', 'Karen',
    'Lisa', 'Nancy', 'Betty', 'Margaret', 'Sandra', 'Ashley', 'Kimberly', 'Emily', 'Donna', 'Michelle',
    'Dorothy', 'Carol', 'Amanda', 'Melissa', 'Deborah', 'Stephanie', 'Rebecca', 'Sharon', 'Laura', 'Cynthia',
    'Kathleen', 'Amy', 'Angela', 'Shirley', 'Anna', 'Brenda', 'Pamela', 'Emma', 'Nicole', 'Helen',
    'Samantha', 'Katherine', 'Christine', 'Debra', 'Rachel', 'Carolyn', 'Janet', 'Catherine', 'Maria', 'Heather'
]

LAST_NAMES = [
    'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
    'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin',
    'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson',
    'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores',
    'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell', 'Carter', 'Roberts',
    'Turner', 'Phillips', 'Evans', 'Parker', 'Edwards', 'Collins', 'Stewart', 'Morris', 'Murphy', 'Cook'
]

# Salary ranges by position level (annual cost in USD)
SALARY_RANGES = {
    'entry': (45000, 65000),
    'mid': (65000, 95000),
    'senior': (95000, 140000),
    'lead': (120000, 180000),
    'manager': (130000, 200000),
    'director': (180000, 280000),
    'vp': (250000, 400000),
    'c_level': (350000, 600000)
}


def get_position_level(position: str) -> str:
    """Determine salary level based on position title"""
    position_lower = position.lower()
    if any(x in position_lower for x in ['ceo', 'cfo', 'cmo', 'chro', 'cto']):
        return 'c_level'
    elif 'vice president' in position_lower or position_lower.startswith('vp'):
        return 'vp'
    elif 'director' in position_lower:
        return 'director'
    elif 'manager' in position_lower or 'lead' in position_lower:
        return 'manager'
    elif 'senior' in position_lower or 'staff' in position_lower or 'principal' in position_lower:
        return 'senior'
    elif any(x in position_lower for x in ['specialist', 'analyst', 'engineer', 'scientist']):
        return 'mid'
    else:
        return 'entry'


def generate_hr_code(emp_id: int) -> str:
    """Generate realistic HR code"""
    prefix = random.choice(['EMP', 'HR', 'E', 'CV'])
    return f"{prefix}{emp_id:06d}"


def generate_name(gender: str) -> tuple:
    """Generate a realistic full name"""
    if gender == 'M':
        first = random.choice(FIRST_NAMES_MALE)
    else:
        first = random.choice(FIRST_NAMES_FEMALE)
    last = random.choice(LAST_NAMES)
    return first, last


def calculate_churn_probability(
    tenure: int,
    employee_cost: float,
    position: str,
    structure: str
) -> float:
    """
    Calculate realistic churn probability based on features.
    This mimics real-world patterns observed in HR analytics.
    """
    prob = 0.15  # Base churn rate

    # Tenure effects - U-shaped curve
    if tenure < 1:
        prob += 0.20  # First year high turnover
    elif tenure < 2:
        prob += 0.10
    elif tenure >= 2 and tenure <= 4:
        prob -= 0.05  # Sweet spot
    elif tenure > 7:
        prob += 0.05  # Long tenure sometimes leads to leaving

    # Cost/salary effects
    level = get_position_level(position)
    min_sal, max_sal = SALARY_RANGES[level]
    mid_sal = (min_sal + max_sal) / 2

    if employee_cost < mid_sal * 0.85:
        prob += 0.12  # Underpaid
    elif employee_cost > mid_sal * 1.15:
        prob -= 0.05  # Well compensated

    # Position effects
    if level in ['entry', 'mid']:
        prob += 0.05
    elif level in ['director', 'vp', 'c_level']:
        prob -= 0.08

    # Structure effects
    high_turnover_structures = ['Sales', 'Customer Support']
    low_turnover_structures = ['Executive Management', 'Research & Development']

    if structure in high_turnover_structures:
        prob += 0.08
    elif structure in low_turnover_structures:
        prob -= 0.05

    # Clamp and add noise
    prob = max(0.02, min(0.50, prob))
    prob += random.gauss(0, 0.08)
    prob = max(0.01, min(0.60, prob))

    return prob


def generate_employee(emp_id: int, managers: list) -> dict:
    """Generate a single realistic employee record"""

    # Demographics
    gender = random.choice(['M', 'F'])
    first_name, last_name = generate_name(gender)

    # Employment
    structure = random.choice(STRUCTURES)
    position = random.choice(POSITIONS_BY_STRUCTURE[structure])

    # Tenure - exponential distribution (more newer employees)
    tenure = int(random.expovariate(0.2))
    tenure = max(0, min(tenure, 25))

    # Employee cost based on position level
    level = get_position_level(position)
    min_sal, max_sal = SALARY_RANGES[level]

    # Add tenure bonus
    tenure_bonus = tenure * random.uniform(1500, 3500)
    base_salary = random.uniform(min_sal, max_sal)
    employee_cost = round(base_salary + tenure_bonus, 2)

    # Manager assignment
    manager_id = None
    if managers and level not in ['c_level', 'vp', 'director']:
        # Prefer managers from same structure
        same_structure_managers = [m for m in managers if m['structure_name'] == structure]
        if same_structure_managers and random.random() < 0.7:
            manager_id = random.choice(same_structure_managers)['hr_code']
        elif managers:
            manager_id = random.choice(managers)['hr_code']

    # Calculate churn probability and determine status
    churn_prob = calculate_churn_probability(tenure, employee_cost, position, structure)
    is_terminated = random.random() < churn_prob

    status = 'Terminated' if is_terminated else 'Active'

    # Termination date (if terminated)
    termination_date = None
    if is_terminated:
        # Terminated within the last 2 years
        days_ago = random.randint(1, 730)
        termination_date = (datetime.now() - timedelta(days=days_ago)).strftime('%Y-%m-%d')

    hr_code = generate_hr_code(emp_id)

    return {
        'hr_code': hr_code,
        'full_name': f"{first_name} {last_name}",
        'structure_name': structure,
        'position': position,
        'status': status,
        'manager_id': manager_id,
        'tenure': tenure,
        'termination_date': termination_date,
        'employee_cost': employee_cost
    }


def generate_dataset(num_rows: int, output_path: Path) -> None:
    """Generate a dataset with the specified number of rows"""
    print(f"Generating {num_rows} employees...")

    employees = []
    managers = []

    # First pass: generate all employees
    for i in range(num_rows):
        emp = generate_employee(i + 1, managers)
        employees.append(emp)

        # Track potential managers
        level = get_position_level(emp['position'])
        if level in ['manager', 'director', 'vp', 'c_level'] and emp['status'] == 'Active':
            managers.append(emp)

    # Second pass: assign managers to employees who don't have one
    for emp in employees:
        if emp['manager_id'] is None:
            level = get_position_level(emp['position'])
            if level not in ['c_level', 'vp']:
                same_structure_managers = [m for m in managers if m['structure_name'] == emp['structure_name'] and m['hr_code'] != emp['hr_code']]
                if same_structure_managers:
                    emp['manager_id'] = random.choice(same_structure_managers)['hr_code']
                elif managers:
                    other_managers = [m for m in managers if m['hr_code'] != emp['hr_code']]
                    if other_managers:
                        emp['manager_id'] = random.choice(other_managers)['hr_code']

    # Write to CSV
    fieldnames = ['hr_code', 'full_name', 'structure_name', 'position', 'status', 'manager_id', 'tenure', 'termination_date', 'employee_cost']

    with open(output_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(employees)

    # Calculate statistics
    terminated_count = sum(1 for e in employees if e['status'] == 'Terminated')
    churn_rate = terminated_count / num_rows * 100

    structure_counts = {}
    for e in employees:
        structure_counts[e['structure_name']] = structure_counts.get(e['structure_name'], 0) + 1

    print(f"  Saved to: {output_path}")
    print(f"  Churn rate: {churn_rate:.1f}% ({terminated_count}/{num_rows})")
    print(f"  Structures: {dict(sorted(structure_counts.items()))}")


def main():
    """Generate all dataset sizes"""
    output_dir = Path(__file__).parent

    sizes = [200, 500, 1000, 10000, 100000]

    random.seed(42)  # For reproducibility

    print("=" * 60)
    print("ChurnVision Sample Dataset Generator")
    print("=" * 60)
    print()

    for size in sizes:
        filename = f"employees_{size}.csv"
        output_path = output_dir / filename
        generate_dataset(size, output_path)
        print()

    print("=" * 60)
    print("All datasets generated successfully!")
    print("=" * 60)


if __name__ == "__main__":
    main()
