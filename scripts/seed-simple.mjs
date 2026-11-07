import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

async function seed() {
  try {
    await client.connect();
    console.log('🌱 Connected to database...');
    
    // Just insert a few basic records for testing
    console.log('Creating locations...');
    await client.query(`
      INSERT INTO locations (name, city, province, country, timezone, is_headquarters) VALUES
      ('Saskatoon HQ', 'Saskatoon', 'Saskatchewan', 'Canada', 'America/Regina', true),
      ('Chennai HQ', 'Chennai', 'Tamil Nadu', 'India', 'Asia/Kolkata', true)
      ON CONFLICT DO NOTHING;
    `);
    
    console.log('Creating departments...');
    await client.query(`
      INSERT INTO departments (name, description) VALUES
      ('Technology', 'Engineering and technical operations'),
      ('People Operations', 'HR and people management')
      ON CONFLICT (name) DO NOTHING;
    `);
    
    console.log('Creating job families and levels...');
    await client.query(`
      INSERT INTO job_families (name, description) VALUES
      ('Manager', 'Management track'),
      ('Individual Contributor', 'IC track')
      ON CONFLICT DO NOTHING;
    `);
    
    await client.query(`
      INSERT INTO job_levels (code, name, description) VALUES
      ('M6', 'M6', 'C-Suite'),
      ('IC3', 'IC3', 'Senior IC')
      ON CONFLICT (code) DO NOTHING;
    `);
    
    console.log('Creating CEO...');
    const ceoRes = await client.query(`
      INSERT INTO employees (
        employee_number, first_name, last_name, email, job_title,
        department_id, location_id, hire_date, employment_status,
        job_family_id, job_level_id, access_level, work_phone, extension
      )
      SELECT
        'E001', 'Brendan', 'King', 'brendan.king@vendasta.com', 'Chief Executive Officer',
        d.id, l.id, '2008-03-15', 'full_time',
        jf.id, jl.id, 'full_admin', '+1-306-955-5512', '101'
      FROM departments d, locations l, job_families jf, job_levels jl
      WHERE d.name = 'Technology' AND l.name = 'Saskatoon HQ'
        AND jf.name = 'Manager' AND jl.code = 'M6'
      ON CONFLICT (email) DO NOTHING
      RETURNING id;
    `);
    
    console.log('✅ Basic seed complete!');
    await client.end();
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    await client.end();
    process.exit(1);
  }
}

seed();

// Re-run to add more employees
async function seedMore() {
  try {
    await client.connect();
    console.log('Adding more employees...');
    
    // Add more employees
    await client.query(`
      INSERT INTO employees (
        employee_number, first_name, last_name, email, job_title,
        department_id, location_id, manager_id, hire_date, employment_status,
        job_family_id, job_level_id, access_level, work_phone, extension
      )
      SELECT
        'E002', 'Sarah', 'Martinez', 'sarah.martinez@vendasta.com', 'Senior Developer',
        d.id, l.id, (SELECT id FROM employees WHERE email = 'brendan.king@vendasta.com'), '2020-05-15', 'full_time',
        jf.id, jl.id, 'employee', '+1-306-555-0100', '102'
      FROM departments d, locations l, job_families jf, job_levels jl
      WHERE d.name = 'Technology' AND l.name = 'Saskatoon HQ'
        AND jf.name = 'Individual Contributor' AND jl.code = 'IC3'
      ON CONFLICT (email) DO NOTHING;
    `);
    
    // Add time off policies
    await client.query(`
      INSERT INTO time_off_policies (name, policy_type, country, accrual_rate, accrual_period, max_balance, requires_approval)
      VALUES 
      ('Canada - Vacation', 'Vacation', 'Canada', 1.25, 'monthly', 25.0, true),
      ('Flex Days', 'Flex', NULL, 0.5, 'monthly', 6.0, true)
      ON CONFLICT DO NOTHING;
    `);
    
    // Add time off balances
    await client.query(`
      INSERT INTO time_off_balances (employee_id, policy_id, balance)
      SELECT e.id, p.id, 15.5
      FROM employees e, time_off_policies p
      WHERE e.email IN ('brendan.king@vendasta.com', 'sarah.martinez@vendasta.com')
        AND p.name = 'Canada - Vacation'
      ON CONFLICT DO NOTHING;
    `);
    
    // Add a pending time off request
    await client.query(`
      INSERT INTO time_off_requests (employee_id, policy_id, start_date, end_date, days_requested, status, notes)
      SELECT e.id, p.id, '2026-12-23', '2026-12-27', 5, 'pending', 'Christmas vacation'
      FROM employees e, time_off_policies p
      WHERE e.email = 'sarah.martinez@vendasta.com'
        AND p.name = 'Canada - Vacation'
      ON CONFLICT DO NOTHING;
    `);
    
    // Add compensation history
    await client.query(`
      INSERT INTO compensation_history (employee_id, effective_date, pay_rate, pay_type, pay_schedule, currency, change_reason)
      SELECT id, hire_date, 120000, 'Salary', 'Semi-Monthly', 'CAD', 'New Employee'
      FROM employees
      WHERE email = 'sarah.martinez@vendasta.com'
      ON CONFLICT DO NOTHING;
    `);
    
    // Add seats
    await client.query(`
      INSERT INTO seats (title, accountabilities, assigned_employee_id, is_open)
      SELECT 
        'Chief Executive Officer',
        '["Overall company strategy and vision","Board relations and investor management","Executive team leadership"]'::jsonb,
        id,
        false
      FROM employees WHERE email = 'brendan.king@vendasta.com'
      ON CONFLICT DO NOTHING;
    `);
    
    console.log('✅ Additional data seeded!');
    await client.end();
  } catch (error) {
    console.error('❌ Failed:', error);
    await client.end();
    process.exit(1);
  }
}

seedMore();
