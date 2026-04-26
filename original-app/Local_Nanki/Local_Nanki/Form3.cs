using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Drawing;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace Local_Nanki
{
    public partial class Form3 : Form
    {
        public Form3(string Mesg)
        {
            InitializeComponent();
            User = Mesg;
        }

        private void Form3_Load(object sender, EventArgs e)
        {
            this.Icon = global::Local_Nanki.Properties.Resources.k_01;
            label2.Text = User;
        }

        private string User;

        private void button1_Click(object sender, EventArgs e)
        {
            this.Close();
        }
    }
}
