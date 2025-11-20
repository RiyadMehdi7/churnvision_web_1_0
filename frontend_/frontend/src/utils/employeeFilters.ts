import { Employee } from '../types/employee';

/**
 * Filter employees to only include active employees
 * This is used for most analysis except exit pattern analysis
 */
export const filterActiveEmployees = (employees: Employee[]): Employee[] => {
  return employees.filter(emp => 
    emp.status === 'Active' || 
    emp.status === null || 
    emp.status === undefined || 
    !emp.termination_date
  );
};

/**
 * Filter employees to only include resigned/terminated employees
 * This is used specifically for exit pattern analysis
 */
export const filterResignedEmployees = (employees: Employee[]): Employee[] => {
  return employees.filter(emp => {
    const status = emp.status?.toLowerCase() || '';
    return status.includes('resigned') || 
           status.includes('terminated') ||
           status.includes('left') ||
           status.includes('quit') ||
           status.includes('inactive') ||
           status.includes('exit') ||
           status === 'resigned' ||
           status === 'terminated' ||
           status === 'left' ||
           status === 'quit' ||
           status === 'inactive' ||
           status === 'exit' ||
           // Also check if employee has termination date
           (emp.termination_date && emp.termination_date !== '' && emp.termination_date !== null);
  });
};

/**
 * Check if an employee is active
 */
export const isActiveEmployee = (emp: Employee): boolean => {
  return emp.status === 'Active' || 
         emp.status === null || 
         emp.status === undefined || 
         !emp.termination_date;
};

/**
 * Check if an employee is resigned/terminated
 */
export const isResignedEmployee = (emp: Employee): boolean => {
  const status = emp.status?.toLowerCase() || '';
  return Boolean(status.includes('resigned') || 
         status.includes('terminated') ||
         status.includes('left') ||
         status.includes('quit') ||
         status.includes('inactive') ||
         status.includes('exit') ||
         status === 'resigned' ||
         status === 'terminated' ||
         status === 'left' ||
         status === 'quit' ||
         status === 'inactive' ||
         status === 'exit' ||
         // Also check if employee has termination date
         (emp.termination_date && emp.termination_date !== '' && emp.termination_date !== null));
}; 