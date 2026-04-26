using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Drawing;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace Starter_Nanki
{
    public partial class Form1 : Form
    {
        public Form1()
        {
            InitializeComponent();
        }

        private void Form1_Load(object sender, EventArgs e)
        {
            this.Icon = global::Starter_Nanki.Properties.Resources.k_01;           
           // folderpass = System.IO.Directory.GetCurrentDirectory();
            //Local_Path = folderpass.Replace(@"Starter_Nanki\Starter_Nanki\bin\Debug", @"Local_Nanki\Local_Nanki\");

            button1.Focus();
            timer1.Enabled = true;
        }

        private string folderpass = "";
        private string Local_Path = "";

        private void button1_Click(object sender, EventArgs e)
        {
           /* System.Diagnostics.Process[] ps = System.Diagnostics.Process.GetProcesses();
            int zz = 0;
            foreach (System.Diagnostics.Process p in ps)
            {
                if (p.ProcessName.ToString() == "Local_Nanki")
                {
                    zz = 1;
                }
            }

            if (zz == 0)
            {*/
                            
           // }


        }

        private void timer1_Tick(object sender, EventArgs e)
        {
            folderpass = System.IO.Directory.GetCurrentDirectory();
            Local_Path = folderpass.Replace(@"Starter_Nanki\Starter_Nanki\bin\Debug", @"Local_Nanki\Local_Nanki\");
            process1.StartInfo.FileName = Local_Path + @"bin\Debug\Local_Nanki.exe";
            process1.StartInfo.WorkingDirectory = Local_Path + @"bin\Debug";

            process1.Start();
            this.Close();
        }
    }
}
