using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Data;
using System.Drawing;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using System.Windows.Forms;
using System.Web;
using System.IO;


namespace Local_Nanki
{
    public partial class Form6 : Form
    {
        public Form6(DataTable d0, DataTable d1, string nn, string aa, string bb)
        {
            InitializeComponent();
            dt_0 = d0;
            dt_1 = d1;
            P_Name = nn;
            Tantou = aa;
            T_Tel = bb;
        }

        private void Form6_Load(object sender, EventArgs e)
        {
            this.Icon = global::Local_Nanki.Properties.Resources.k_01;
            for (int hh = 0; hh < dt_0.Rows.Count; hh++)

            {
                DataRow Ne_Row = dataSet1.DataTable2.NewRow();
                for (int ii = 0; ii < dt_0.Columns.Count; ii++)
                {
                    Ne_Row[ii] = dt_0.Rows[hh][ii].ToString();
                }
                dataSet1.DataTable2.Rows.Add(Ne_Row);
            }

            for (int hh = 0; hh < dt_1.Rows.Count; hh++)
            {
                DataRow Ne_Row = dataSet3.DataTable3.NewRow();
                for (int ii = 0; ii < dt_1.Columns.Count; ii++)
                {
                    Ne_Row[ii] = dt_1.Rows[hh][ii].ToString();
                }
                dataSet3.DataTable3.Rows.Add(Ne_Row);
            }

            if (dataSet3.DataTable3.Rows.Count == 0)
            {
                label7.Visible = true;
            }
            else if (dataSet3.DataTable3.Rows.Count == 1)
            {
                label3.Text = dataSet3.DataTable3.Rows[0][0].ToString();
                label3.Visible = true;
            }
            else if (dataSet3.DataTable3.Rows.Count == 2)
            {
                label3.Text = dataSet3.DataTable3.Rows[0][0].ToString();
                label3.Visible = true;
                label4.Text = dataSet3.DataTable3.Rows[1][0].ToString();
                label4.Visible = true;
            }

            foreach (DataSet1.DataTable2Row abc in dataSet1.DataTable2)
            {
                if (P_Name == abc[12].ToString())
                {
                    comboBox1.Items.Add(abc[0].ToString() + "　" + abc[1].ToString());
                }
            }
            if (comboBox1.Items.Count > 0)
            {
                comboBox1.Text = comboBox1.Items[0].ToString();
            }

            textBox1.Text = Tantou;
            textBox2.Text = T_Tel;
            button1.Focus();
        }

        private DataTable dt_0;
        private DataTable dt_1;
        private string P_Name;
        private string Tantou;
        private string T_Tel;

        private void button1_Click(object sender, EventArgs e)////////////////印刷///////////////
        {
            this.Close();
        }

        private void button2_Click(object sender, EventArgs e)////////////////キャンセル//////////
        {
            this.Close();
        }

       
    }
}
