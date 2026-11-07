import pg from 'pg';
const { Client } = pg;

async function seed() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    await client.connect();
    console.log('🌱 Connected to database...');
    
    console.log('Creating locations...');
    await client.query(`
      INSERT INTO locations (name, city, province, country, timezone, is_headquarters) VALUES
      ('Saskatoon HQ', 'Saskatoon', 'Saskatchewan', 'Canada', 'America/Regina', true),
      ('Chennai HQ', 'Chennai', 'Tamil Nadu', 'India', 'Asia/Kolkata', true),
      ('Boca Raton', 'Boca Raton', 'Florida', 'United States', 'America/New_York', false)
      ON CONFLICT DO NOTHING;
    `);
    
    console.log('Creating departments...');
    await client.query(`
      INSERT INTO departments (name, description) VALUES
      ('Technology', 'Engineering and technical operations'),
      ('People Operations', 'HR and people management'),
      ('Sales', 'Revenue and business development'),
      ('Marketing', 'Marketing and demand generation')
      ON CONFLICT (name) DO NOTHING;
    `);
    
    console.log('Creating divisions...');
    await client.query(`
      INSERT INTO divisions (name, description) VALUES
      ('R&D', 'Research and Development'),
      ('Support', 'Customer Support'),
      ('Channel Sales', 'Partner and channel sales')
      ON CONFLICT (name) DO NOTHING;
    `);
    
    console.log('Creating teams...');
    await client.query(`
      INSERT INTO teams (name, description) VALUES
      ('Phoenix', 'Core platform team'),
      ('SRE', 'Site Reliability Engineering'),
      ('Support - Tier 1', 'Front-line support')
      ON CONFLICT DO NOTHING;
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
      ('M4', 'M4', 'VP'),
      ('M3', 'M3', 'Director'),
      ('M1', 'M1', 'Manager'),
      ('IC4', 'IC4', 'Staff IC'),
      ('IC3', 'IC3', 'Senior IC'),
      ('IC2', 'IC2', 'Intermediate IC'),
      ('IC1', 'IC1', 'Junior IC')
      ON CONFLICT (code) DO NOTHING;
    `);
    
    console.log('Creating CEO...');
    await client.query(`
      INSERT INTO employees (
        employee_number, first_name, last_name, email, job_title,
        department_id, location_id, hire_date, employment_status,
        job_family_id, job_level_id, access_level, work_phone, extension,
        birth_date, gender
      )
      SELECT
        'E001', 'Brendan', 'King', 'brendan.king@vendasta.com', 'Chief Executive Officer',
        d.id, l.id, '2008-03-15', 'full_time',
        jf.id, jl.id, 'full_admin', '+1-306-955-5512', '101',
        '1975-03-10', 'male'
      FROM departments d, locations l, job_families jf, job_levels jl
      WHERE d.name = 'Technology' AND l.name = 'Saskatoon HQ'
        AND jf.name = 'Manager' AND jl.code = 'M6'
      ON CONFLICT (email) DO NOTHING;
    `);
    
    console.log('Creating more employees...');
    const ceoId = (await client.query("SELECT id FROM employees WHERE email = 'brendan.king@vendasta.com'")).rows[0].id;
    
    await client.query(`
      INSERT INTO employees (
        employee_number, first_name, last_name, email, job_title,
        department_id, division_id, location_id, manager_id, hire_date, employment_status,
        job_family_id, job_level_id, access_level, work_phone, extension,
        birth_date, gender
      )
      SELECT
        'E002', 'Sarah', 'Martinez', 'sarah.martinez@vendasta.com', 'Senior Developer',
        d.id, div.id, l.id, ${ceoId}, '2020-05-15', 'full_time',
        jf.id, jl.id, 'manager', '+1-306-555-0100', '102',
        '1990-07-22', 'female'
      FROM departments d, divisions div, locations l, job_families jf, job_levels jl
      WHERE d.name = 'Technology' AND div.name = 'R&D' AND l.name = 'Saskatoon HQ'
        AND jf.name = 'Individual Contributor' AND jl.code = 'IC3'
      ON CONFLICT (email) DO NOTHING;
    `);
    
    await client.query(`
      INSERT INTO employees (
        employee_number, first_name, last_name, email, job_title,
        department_id, location_id, manager_id, hire_date, employment_status,
        job_family_id, job_level_id, access_level, work_phone, extension,
        birth_date, gender
      )
      SELECT
        'E003', 'David', 'Chen', 'david.chen@vendasta.com', 'Developer II',
        d.id, l.id, ${ceoId}, '2021-03-10', 'full_time',
        jf.id, jl.id, 'employee', '+1-306-555-0101', '103',
        '1993-11-15', 'male'
      FROM departments d, locations l, job_families jf, job_levels jl
      WHERE d.name = 'Technology' AND l.name = 'Saskatoon HQ'
        AND jf.name = 'Individual Contributor' AND jl.code = 'IC2'
      ON CONFLICT (email) DO NOTHING;
    `);
    
    const sarahId = (await client.query("SELECT id FROM employees WHERE email = 'sarah.martinez@vendasta.com'")).rows[0]?.id;
    
    if (sarahId) {
      await client.query(`
        INSERT INTO employees (
          employee_number, first_name, last_name, email, job_title,
          department_id, location_id, manager_id, hire_date, employment_status,
          job_family_id, job_level_id, access_level, work_phone, extension,
          birth_date, gender
        )
        SELECT
          'E004', 'Emily', 'Johnson', 'emily.johnson@vendasta.com', 'Junior Developer',
          d.id, l.id, ${sarahId}, '2024-08-01', 'full_time',
          jf.id, jl.id, 'employee', '+1-306-555-0102', '104',
          '1998-05-08', 'female'
        FROM departments d, locations l, job_families jf, job_levels jl
        WHERE d.name = 'Technology' AND l.name = 'Saskatoon HQ'
          AND jf.name = 'Individual Contributor' AND jl.code = 'IC1'
        ON CONFLICT (email) DO NOTHING;
      `);
    }
    
    console.log('Creating time off policies...');
    await client.query(`
      INSERT INTO time_off_policies (name, policy_type, country, accrual_rate, accrual_period, max_balance, requires_approval, description)
      VALUES 
      ('Canada - Vacation A', 'Vacation', 'Canada', 0.8333, 'monthly', 20.0, true, '10 days per year'),
      ('Canada - Vacation B', 'Vacation', 'Canada', 1.25, 'monthly', 25.0, true, '15 days per year'),
      ('Flex Days', 'Flex', NULL, 0.5, 'monthly', 6.0, true, '6 flex days per year'),
      ('Sick - Canada', 'Sick', 'Canada', 0.8333, 'monthly', 50.0, false, 'Sick leave')
      ON CONFLICT DO NOTHING;
    `);
    
    console.log('Creating time off balances...');
    await client.query(`
      INSERT INTO time_off_balances (employee_id, policy_id, balance)
      SELECT e.id, p.id,
        CASE 
          WHEN p.name = 'Canada - Vacation B' THEN 15.5
          WHEN p.name = 'Flex Days' THEN 4.0
          WHEN p.name = 'Sick - Canada' THEN 8.0
          ELSE 10.0
        END
      FROM employees e
      CROSS JOIN time_off_policies p
      WHERE e.email IN ('brendan.king@vendasta.com', 'sarah.martinez@vendasta.com', 'david.chen@vendasta.com', 'emily.johnson@vendasta.com')
        AND p.country IN ('Canada', NULL)
      ON CONFLICT DO NOTHING;
    `);
    
    console.log('Creating time off requests...');
    const emilyId = (await client.query("SELECT id FROM employees WHERE email = 'emily.johnson@vendasta.com'")).rows[0]?.id;
    
    if (emilyId) {
      await client.query(`
        INSERT INTO time_off_requests (employee_id, policy_id, start_date, end_date, days_requested, status, notes)
        SELECT ${emilyId}, p.id, '2026-12-23', '2026-12-27', 5, 'pending', 'Christmas vacation'
        FROM time_off_policies p
        WHERE p.name = 'Canada - Vacation B'
        ON CONFLICT DO NOTHING;
      `);
      
      await client.query(`
        INSERT INTO time_off_requests (employee_id, policy_id, start_date, end_date, days_requested, status, notes, reviewed_by, reviewed_at)
        SELECT ${emilyId}, p.id, '2026-11-01', '2026-11-01', 1, 'approved', 'Personal day', ${sarahId}, NOW()
        FROM time_off_policies p
        WHERE p.name = 'Flex Days'
        ON CONFLICT DO NOTHING;
      `);
    }
    
    console.log('Creating compensation history...');
    await client.query(`
      INSERT INTO compensation_history (employee_id, effective_date, pay_rate, pay_type, pay_schedule, currency, change_reason)
      SELECT e.id, e.hire_date,
        CASE 
          WHEN e.email = 'brendan.king@vendasta.com' THEN 250000
          WHEN e.email = 'sarah.martinez@vendasta.com' THEN 120000
          WHEN e.email = 'david.chen@vendasta.com' THEN 95000
          WHEN e.email = 'emily.johnson@vendasta.com' THEN 75000
          ELSE 80000
        END,
        'Salary', 'Semi-Monthly', 'CAD', 'New Employee'
      FROM employees e
      WHERE e.email IN ('brendan.king@vendasta.com', 'sarah.martinez@vendasta.com', 'david.chen@vendasta.com', 'emily.johnson@vendasta.com')
      ON CONFLICT DO NOTHING;
    `);
    
    console.log('Creating seats...');
    await client.query(`
      INSERT INTO seats (title, accountabilities, assigned_employee_id, is_open)
      SELECT 
        'Chief Executive Officer',
        '["Overall company strategy and vision","Board relations and investor management","Executive team leadership"]'::jsonb,
        e.id,
        false
      FROM employees e WHERE e.email = 'brendan.king@vendasta.com'
      ON CONFLICT DO NOTHING;
    `);
    
    const ceoSeatId = (await client.query("SELECT id FROM seats WHERE title = 'Chief Executive Officer'")).rows[0]?.id;
    
    if (ceoSeatId) {
      await client.query(`
        INSERT INTO seats (title, accountabilities, parent_seat_id, assigned_employee_id, is_open)
        SELECT 
          'VP of Engineering',
          '["Engineering team leadership","Technical roadmap and architecture","Delivery excellence"]'::jsonb,
          ${ceoSeatId},
          e.id,
          false
        FROM employees e WHERE e.email = 'sarah.martinez@vendasta.com'
        ON CONFLICT DO NOTHING;
      `);
    }
    
    console.log('Creating job history...');
    await client.query(`
      INSERT INTO job_history (employee_id, effective_date, job_title, department_id, location_id, manager_id, employment_status, comment)
      SELECT e.id, '2023-01-15', 'Developer II', d.id, l.id, m.id, 'full_time', 'Promotion to Senior Developer'
      FROM employees e, departments d, locations l, employees m
      WHERE e.email = 'sarah.martinez@vendasta.com'
        AND d.name = 'Technology' AND l.name = 'Saskatoon HQ'
        AND m.email = 'brendan.king@vendasta.com'
      ON CONFLICT DO NOTHING;
    `);
    
    console.log('Creating onboarding tasks...');
    await client.query(`
      INSERT INTO task_templates (name, task_type, assigned_to_role, due_days_from_start, order_index)
      VALUES
      ('Laptop and Equipment Setup', 'onboarding', 'it', -1, 1),
      ('Create and Review New Hire Training Plan', 'onboarding', 'manager', 0, 2),
      ('Meet & Greet', 'onboarding', 'manager', 1, 3)
      ON CONFLICT DO NOTHING;
    `);
    
    if (emilyId) {
      const templates = (await client.query("SELECT id, name, due_days_from_start FROM task_templates WHERE task_type = 'onboarding' ORDER BY order_index")).rows;
      
      for (const template of templates) {
        await client.query(`
          INSERT INTO employee_tasks (employee_id, template_id, task_type, title, status, assigned_to_id, due_date)
          VALUES ($1, $2, 'onboarding', $3, 'pending', $4, DATE '2024-08-01' + INTERVAL '1 day' * $5)
          ON CONFLICT DO NOTHING;
        `, [emilyId, template.id, template.name, sarahId, template.due_days_from_start || 0]);
      }
    }
    
    console.log('✅ Full seed complete!');
    await client.end();
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    await client.end();
    process.exit(1);
  }
}

seed();
